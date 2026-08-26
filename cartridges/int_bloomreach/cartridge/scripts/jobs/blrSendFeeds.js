'use strict';

// API Objects
var File = require('dw/io/File');
var Site = require('dw/system/Site');
var Status = require('dw/system/Status');
var Logger = require('dw/system/Logger').getLogger('Bloomreach', 'blrSendFeed.js');

// Max 429 retries per file before the Data Hub delivery gives up.
var DATAHUB_MAX_RETRIES = 3;
// Ceiling on any single 429 wait (SFCC job scripts have no non-blocking sleep;
// the wait is a bounded busy-wait, so keep it short to avoid burning job time).
var DATAHUB_MAX_WAIT_SECONDS = 30;

/**
 * Bounded busy-wait. SFCC's script API has no sleep(); Data Hub tells us exactly
 * how long to wait via retry_after_seconds, so honor it up to a small ceiling.
 * @param {number} seconds - seconds to wait
 */
function waitSeconds(seconds) {
    var capped = Math.min(Math.max(seconds || 0, 0), DATAHUB_MAX_WAIT_SECONDS);
    var end = Date.now() + (capped * 1000);
    while (Date.now() < end) { /* busy-wait: no non-blocking sleep available */ }
}

/**
 * Returns a status of okay
 * @param {Object} parameters - object of site parameters
 * @returns {string} the status results
 */
function execute(parameters) {
    var enabled = parameters.Enabled;
    if (!enabled) {
        Logger.info('Upload step is not enabled, skipping...');
        return new Status(Status.OK);
    }

    // Bloomreach helper scripts
    var { PRODUCT_FEED_LOCAL_PATH, PRODUCT_FEED_PREFIX,
        CONTENT_FEED_LOCAL_PATH, CONTENT_FEED_PREFIX }
        = require('*/cartridge/scripts/bloomreach/lib/constants');
    var serviceHelper = require('*/cartridge/scripts/bloomreach/services/serviceHelper');
    var blmHelper = require('*/cartridge/scripts/bloomreach/helpers/blmHelper');
    var libBloomreach = require('*/cartridge/scripts/bloomreach/lib/libBloomreach');

    try {
        var type = parameters.FeedType;
        var updateType = parameters.UpdateType;
        var pattern;
        var localPath;
        var feedFileType;

        // Product feeds may be delivered via the Data Hub Item Collections API
        // instead of the Catalog Management API. Content is never routed to Data Hub.
        var useDataHub = (type === 'Product')
            && (libBloomreach.getPreference('ProductFeedDeliveryMode') === 'DataHub');
        // Data Hub update_mode mirrors the existing PUT (rewrite=full) / PATCH (delta) distinction.
        var dataHubUpdateMode = (updateType === 'PUT') ? 'full' : 'delta';
        var dataHubCollectionMap = useDataHub ? libBloomreach.getPreference('DataHubCollectionMap') : null;

        // Real I/O implementations injected into the (pure) Data Hub delivery orchestrator.
        var dataHubDelivery;
        var dataHubDeps;
        if (useDataHub) {
            dataHubDelivery = require('*/cartridge/scripts/bloomreach/helpers/dataHubDelivery');
            var dataHubTransform = require('*/cartridge/scripts/bloomreach/helpers/dataHubTransform');
            dataHubDeps = {
                transformFeedFile: dataHubTransform.transformFeedFile,
                makeFile: function (p) { return new File(p); },
                gzipFile: function (f) {
                    var gz = new File(f.getFullPath() + '.gz');
                    f.gzip(gz);
                    return gz;
                },
                sendRecords: serviceHelper.sendDataHubFeedData,
                getUploadUrls: serviceHelper.getDataHubUploadUrls,
                uploadFile: serviceHelper.uploadFileToSignedUrl,
                sendFileReference: serviceHelper.sendDataHubFileReference,
                parseError: serviceHelper.parseDataHubError,
                waitSeconds: waitSeconds,
                logger: Logger,
                maxRetries: DATAHUB_MAX_RETRIES
            };
        }

        switch (type) {
            case 'Product':
                pattern = PRODUCT_FEED_PREFIX + '_' + Site.current.ID;
                localPath = PRODUCT_FEED_LOCAL_PATH;
                feedFileType = 'products';
                break;
            case 'Content':
                pattern = CONTENT_FEED_PREFIX + '_' + Site.current.ID;
                localPath = CONTENT_FEED_LOCAL_PATH;
                feedFileType = 'items';
                break;
            default:
                break;
        }

        var fileregex = new RegExp('^' + pattern + '_\\d{14}.*?\\.jsonl$');
        var localPathFile = new File([File.TEMP, localPath].join(File.SEPARATOR));
        var localFiles = localPathFile.listFiles(function (f) {
            return fileregex.test(f.name);
        });

        // Send data to API
        var FileReader = require('dw/io/FileReader');

        for (var i = 0; i < localFiles.length; i++) {
            var file = localFiles[i];
            var fileReader = new FileReader(file);
            var regex1 = new RegExp('\\d{14}_(.*)(?=\\.)');
            var matches = regex1.exec(file.name);
            var locale = (matches && matches.length === 2) ? matches[1] : '';

            if (useDataHub) {
                // ---- Data Hub Item Collections API delivery (product only) ----
                // Resolve the target item-collection for this locale (explicit map, fail loud).
                var collectionName = serviceHelper.resolveDataHubCollection(dataHubCollectionMap, locale);
                if (!collectionName) {
                    Logger.error('No Data Hub item-collection mapped for locale "{0}". '
                        + 'Set blr_DataHubCollectionMap (a "default" key or a per-locale entry).', locale);
                    fileReader.close();
                    return new Status(Status.ERROR);
                }

                var dhOutcome = dataHubDelivery.deliverProductFeed({
                    updateMode: dataHubUpdateMode,
                    collectionName: collectionName,
                    srcFile: file,
                    deps: dataHubDeps
                });

                if (!dhOutcome.ok) {
                    if (dhOutcome.httpStatus === 413) {
                        Logger.error('Data Hub payload too large (413) for collection "{0}" even via '
                            + 'file upload; feed exceeds the maximum. Split the feed or contact Bloomreach.',
                            collectionName);
                    } else {
                        Logger.error('Data Hub delivery failed (collection "{0}", locale "{1}"): HTTP {2}',
                            collectionName, locale, dhOutcome.httpStatus);
                    }
                    fileReader.close();
                    file.remove();
                    return new Status(Status.ERROR);
                }

                // 202 Accepted -> { data: { id, type, state } }. Track the async job id.
                if (dhOutcome.jobId) {
                    Logger.info('Data Hub records-update job submitted: {0} (collection "{1}", mode {2})',
                        dhOutcome.jobId, collectionName, dataHubUpdateMode);
                    blmHelper.saveIdToCustomObj(dhOutcome.jobId, 'datahub');
                } else {
                    Logger.warn('Data Hub response missing job id (collection "{0}")', collectionName);
                }

                fileReader.close();
                file.remove();
            } else {
                // ---- Catalog Management API delivery (default; content always) ----
                var result = null;
                switch (type) {
                    case 'Product':
                        // Send as file over http
                        result = serviceHelper.sendFileFeedData(updateType, file, feedFileType, locale);
                        break;
                    case 'Content':
                        result = serviceHelper.sendFileFeedData(updateType, file, feedFileType, locale);
                        break;
                    default:
                        break;
                }

                if (!result.isOk()) {
                    Logger.error('Problem sanding product Data: ' + result.msg);
                    fileReader.close();
                    file.remove();
                    return new Status(Status.ERROR);
                }

                // Save jobID to the custom object (Catalog Management API)
                blmHelper.saveIdToCustomObj(result.object.jobId, 'catalog');

                fileReader.close();
                file.remove();
            }
        }

        // Remove old Snapshot file and rename a new one
        if (type === 'Product') {
            var { PRODUCT_SNAPSHOT_PREFIX } = require('*/cartridge/scripts/bloomreach/lib/constants');
            var snapshotFileName = PRODUCT_SNAPSHOT_PREFIX + Site.current.ID;

            var newSnapshotFile = new File(localPathFile, snapshotFileName + '.tmp');
            var snapshotFile = new File(localPathFile, snapshotFileName + '.jsonl');

            if (newSnapshotFile.exists()) {
                snapshotFile.remove();
            }
            newSnapshotFile.renameTo(snapshotFile);
        }
    } catch (error) {
        Logger.error('Exception caught during product feed upload: {0}', error.message);
        return new Status(Status.ERROR);
    }

    return new Status(Status.OK);
}

module.exports.execute = execute;
