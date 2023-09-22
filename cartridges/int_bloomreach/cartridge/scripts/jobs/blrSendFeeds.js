'use strict';

// API Objects
var File = require('dw/io/File');
var Site = require('dw/system/Site');
var Status = require('dw/system/Status');
var Logger = require('dw/system/Logger').getLogger('Bloomreach', 'blrSendFeed.js');

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

    try {
        var type = parameters.FeedType;
        var updateType = parameters.UpdateType;
        var pattern;
        var localPath;
        var feedFileType;

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

            // Save jobID to the custom object
            blmHelper.saveIdToCustomObj(result.object.jobId);

            fileReader.close();
            file.remove();
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
