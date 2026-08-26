'use strict';

// API Objects
var Site = require('dw/system/Site');
var Status = require('dw/system/Status');
var Logger = require('dw/system/Logger').getLogger('Bloomreach', 'blrUploadFeed.js');
var CustomObjectMgr = require('dw/object/CustomObjectMgr');

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
    var serviceHelper = require('*/cartridge/scripts/bloomreach/services/serviceHelper');
    var blmHelper = require('*/cartridge/scripts/bloomreach/helpers/blmHelper');

    var allBlmImportJobsIdList = CustomObjectMgr.getAllCustomObjects('blm_FeedJobId');

    var submitResult = null;
    var counter = allBlmImportJobsIdList.getCount();
    while (allBlmImportJobsIdList.hasNext()) {
        var blmImportJobsId = allBlmImportJobsIdList.next();
        submitResult = serviceHelper.getJobStatus(blmImportJobsId.custom.jobId);
        if (submitResult.ok) {
            if (submitResult.object.status === 'failed'
                || submitResult.object.status === 'skipped'
                || submitResult.object.status === 'killed'
                || submitResult.object.status === 'success') {
                CustomObjectMgr.remove(blmImportJobsId);
                counter--;
            }
        } else {
            Logger.error('Get job status error: ' + submitResult.msg);
            counter--;
        }
    }

    if (counter === 0) {
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

        for (var i = 0; i < siteLocalesSize; i++) {
            submitResult = serviceHelper.publishIndex(siteLocales[i], type);
            if (submitResult.isOk()) {
                blmHelper.saveIdToCustomObj(submitResult.object.jobId);
            } else {
                Logger.error('Publish Index error: ' + submitResult.msg);
                return new Status(Status.ERROR);
            }
        }
    }

    return new Status(Status.OK);
}

module.exports.execute = execute;
