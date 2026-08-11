'use strict';

// API Objects
var Site = require('dw/system/Site');
var Status = require('dw/system/Status');
var Logger = require('dw/system/Logger').getLogger('Bloomreach', 'blrPublishIndex.js');
var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Transaction = require('dw/system/Transaction');

/**
 * Returns a status of okay
 * @param {Object} parameters - object of site parameters
 * @returns {string} the status results
 */
function execute(parameters) {
    var enabled = parameters.Enabled;
    var type = parameters.FeedType === 'Product' ? 'products' : 'items';
    if (!enabled) {
        Logger.info('Publish Index step is not enabled, skipping...');
        return new Status(Status.OK);
    }

    // Bloomreach helper scripts
    var serviceHelper = require('*/cartridge/scripts/bloomreach/services/serviceHelperV3');
    var blmHelper = require('*/cartridge/scripts/bloomreach/helpers/blmHelper');

    var currentSiteId = Site.current.ID;
    var allBlmImportJobsIdList = CustomObjectMgr.getAllCustomObjects('blm_FeedJobId');

    var submitResult = null;
    var pendingCount = 0;
    var rowsToRemove = [];

    try {
        while (allBlmImportJobsIdList.hasNext()) {
            var blmImportJobsId = allBlmImportJobsIdList.next();
            var rowSiteId = blmImportJobsId.custom.siteId;

            if (rowSiteId && rowSiteId !== currentSiteId) {
                // blm_FeedJobId is stored org-wide, so another site's in-flight jobs show up
                // here too. Leave them for that site's own publish job rather than polling
                // them against this site's catalog and deleting them.
                Logger.debug('Skipping blm_FeedJobId row owned by site {0}', rowSiteId);
            } else if (!blmImportJobsId.custom.type) {
                // Written by the v1 code path, which recorded the job ID alone. The v3 status
                // endpoint is nested under the catalog, so there is no URL to poll: drop the
                // row rather than issue a request that can only 404.
                Logger.warn('Discarding legacy blm_FeedJobId row with no feed type, jobId: {0}',
                    blmImportJobsId.custom.jobId);
                rowsToRemove.push(blmImportJobsId);
            } else {
                submitResult = serviceHelper.getJobStatus(
                    blmImportJobsId.custom.jobId,
                    blmImportJobsId.custom.type,
                    blmImportJobsId.custom.locale,
                    blmImportJobsId.custom.environment
                );

                if (submitResult.ok) {
                    if (submitResult.object.status === 'failed'
                        || submitResult.object.status === 'skipped'
                        || submitResult.object.status === 'killed'
                        || submitResult.object.status === 'success') {
                        rowsToRemove.push(blmImportJobsId);
                    } else {
                        pendingCount += 1;
                    }
                } else {
                    // As in v1, an unreadable status is logged but does not count as pending,
                    // so it cannot block the index publish indefinitely. The row is kept so
                    // the next run retries it.
                    Logger.error('Get job status error: ' + (submitResult.errorMessage || submitResult.msg));
                }
            }
        }
    } finally {
        allBlmImportJobsIdList.close();
    }

    // Removal is collected and applied after the iterator is closed, inside a transaction as
    // CustomObjectMgr.remove requires.
    if (rowsToRemove.length > 0) {
        Transaction.wrap(function () {
            rowsToRemove.forEach(function (row) {
                CustomObjectMgr.remove(row);
            });
        });
    }

    if (pendingCount === 0) {
        var currentSites = Site.getCurrent();
        var isMultiLocale = require('*/cartridge/scripts/bloomreach/lib/libBloomreach').getPreference('MiltiLocaleEnabled');
        var currentLocale = request.getLocale();
        var siteLocales;
        var siteLocalesSize;

        if (isMultiLocale) {
            siteLocales = currentSites.getAllowedLocales();
            siteLocalesSize = siteLocales.size();
        } else {
            siteLocales = [currentLocale];
            siteLocalesSize = siteLocales.length;
        }

        var environment = serviceHelper.getEnvironment();

        for (var i = 0; i < siteLocalesSize; i++) {
            submitResult = serviceHelper.publishIndex(siteLocales[i], type);
            if (submitResult.isOk()) {
                blmHelper.saveIdToCustomObj(submitResult.object.jobId, {
                    type: type,
                    locale: siteLocales[i],
                    environment: environment,
                    siteId: currentSiteId
                });
            } else {
                Logger.error('Publish Index error: ' + (submitResult.errorMessage || submitResult.msg));
                return new Status(Status.ERROR);
            }
        }
    }

    return new Status(Status.OK);
}

module.exports.execute = execute;
