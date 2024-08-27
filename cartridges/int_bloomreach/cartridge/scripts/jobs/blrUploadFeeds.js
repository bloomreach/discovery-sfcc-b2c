'use strict';

// API Objects
var File = require('dw/io/File');
var Site = require('dw/system/Site');
var Status = require('dw/system/Status');
var KeyRef = require('dw/crypto/KeyRef');
var SFTPClient = require('dw/net/SFTPClient');
var Logger = require('dw/system/Logger').getLogger('Bloomreach', 'blrUploadFeed.js');

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
        CONTENT_FEED_LOCAL_PATH, CONTENT_FEED_PREFIX,
        PRODUCT_SNAPSHOT_PREFIX } = require('*/cartridge/scripts/bloomreach/lib/constants');

    var serviceHelper = require('*/cartridge/scripts/bloomreach/services/serviceHelper');
    var blmHelper = require('*/cartridge/scripts/bloomreach/helpers/blmHelper');
    var libBloomreach = require('*/cartridge/scripts/bloomreach/lib/libBloomreach');

    var uploadedFiles = [];
    var feedFileType;
    var localPathFile;
    var type = parameters.FeedType;
    var remoteFeedPath = parameters.PathDestination;

    try {
        var pattern;
        var localPath;

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
        localPathFile = new File([File.TEMP, localPath].join(File.SEPARATOR));
        var localFiles = localPathFile.listFiles(function (f) {
            return fileregex.test(f.name);
        });

        var keyRef = new KeyRef('bloomreach');

        var sftp = new SFTPClient();
        sftp.setIdentity(keyRef);

        var sftpUrl = libBloomreach.getPreference('sftpUrl');
        var domainKey = libBloomreach.getPreference('DomainKey');
        var sftpPassKey = libBloomreach.getPreference('sftpPassKey');

        sftp.connect(sftpUrl, domainKey, sftpPassKey);

        // go to the sftp destination folder
        var result = sftp.cd(remoteFeedPath);
        if (!result) {
            result = sftp.mkdir(remoteFeedPath);
            if (!result) {
                Logger.error('Problem testing sftp server. path: {0}', remoteFeedPath);
                return new Status(Status.ERROR);
            }
            result = sftp.cd(remoteFeedPath);
            if (!result) {
                Logger.error('Problem testing sftp server. path: {0}', remoteFeedPath);
                return new Status(Status.ERROR);
            }
        }

        // get list of files
        var remoteFilesInfo = sftp.list();
        if (!remoteFilesInfo) {
            Logger.error('Problem during sftp list operation');
            return new Status(Status.ERROR);
        }

        // remove existing feed files from sftp folder
        remoteFilesInfo.forEach(function (item) {
            var fname = item.getName();
            if (fileregex.test(fname) === true) {
                if (!sftp.del(fname)) {
                    Logger.error('Problem deleting existing file: ' + fname);
                }
            }
        });

        // upload files to the sftp
        for (var i = 0; i < localFiles.length; i++) {
            var file = localFiles[i];
            result = sftp.putBinary(file.name, file);

            if (!result) {
                Logger.error('Problem uploading file: ' + file.name);
                return new Status(Status.ERROR);
            }

            var regex1 = new RegExp('\\d{14}_(.*)(?=\\.)');
            var matches = regex1.exec(file.name);
            var locale = (matches && matches.length === 2) ? matches[1] : '';

            uploadedFiles.push({
                fileName: remoteFeedPath + '/' + file.name,
                locale: locale
            });
            file.remove();
        }

        sftp.disconnect();
    } catch (error) {
        Logger.error('Exception caught during product feed upload: {0}', error.message);
        return new Status(Status.ERROR);
    }

    // Submit file list for Bloomreach data update
    for (var j = 0; j < uploadedFiles.length; j++) {
        var submitResult = serviceHelper.sendFeedData('PUT', [uploadedFiles[j].fileName], feedFileType, uploadedFiles[j].locale);
        if (!submitResult.isOk()) {
            Logger.error('Submit file error: ' + submitResult.msg);
            return new Status(Status.ERROR);
        }
        blmHelper.saveIdToCustomObj(submitResult.object.jobId);
    }

    // Remove old Snapshot file and rename a new one
    if (type === 'Product') {
        var snapshotFileName = PRODUCT_SNAPSHOT_PREFIX + Site.current.ID;

        var newSnapshotFile = new File(localPathFile, snapshotFileName + '.tmp');
        var snapshotFile = new File(localPathFile, snapshotFileName + '.jsonl');

        if (newSnapshotFile.exists()) {
            snapshotFile.remove();
        }
        newSnapshotFile.renameTo(snapshotFile);
    }

    return new Status(Status.OK);
}

module.exports.execute = execute;
