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
        var jobId = blmImportJobsId.custom.jobId;
        // Job ids live in different namespaces per API, so poll the endpoint the id
        // actually came from. Records created before source tracking have no source
        // and originated on the Catalog Management API, so default to 'catalog'.
        var source = blmImportJobsId.custom.source || 'catalog';

        if (source === 'datahub') {
            submitResult = serviceHelper.getDataHubJobStatus(jobId);
            if (submitResult.ok) {
                // Data Hub job state vocabulary (per the Data Hub "get job" API) is
                // distinct from Catalog Management's: terminal states are
                // success | fail | skipped | canceled (non-terminal: pending | running).
                // Documented lowercase; compared case-insensitively to tolerate casing drift.
                var dhState = (submitResult.object && submitResult.object.data && submitResult.object.data.state)
                    ? String(submitResult.object.data.state).toLowerCase() : '';
                if (dhState === 'success' || dhState === 'fail'
                    || dhState === 'skipped' || dhState === 'canceled' || dhState === 'cancelled') {
                    CustomObjectMgr.remove(blmImportJobsId);
                    counter--;
                }
            } else {
                Logger.error('Get Data Hub job status error: ' + submitResult.msg);
                counter--;
            }
        } else {
            submitResult = serviceHelper.getJobStatus(jobId);
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

        // OPEN QUESTION (needs Bloomreach Data Hub team input, do NOT resolve by guessing):
        // publishIndex() targets the legacy Catalog Management "indexes" endpoint. It is
        // unclear whether this final publish call is meaningful/necessary at all when
        // product delivery goes through Data Hub (Item Collections may index on ingest,
        // making a separate publish redundant or wrong). This fix makes status tracking
        // and custom-object cleanup correct for Data Hub job ids, but deliberately does
        // NOT change whether publishIndex runs for Data Hub-delivered collections. The
        // call is left in place unchanged pending confirmation from Bloomreach.
        for (var i = 0; i < siteLocalesSize; i++) {
            submitResult = serviceHelper.publishIndex(siteLocales[i], type);
            if (submitResult.isOk()) {
                // publishIndex hits the Catalog Management API, so its job id is 'catalog'.
                blmHelper.saveIdToCustomObj(submitResult.object.jobId, 'catalog');
            } else {
                Logger.error('Publish Index error: ' + submitResult.msg);
                return new Status(Status.ERROR);
            }
        }
    }

    return new Status(Status.OK);
}

module.exports.execute = execute;
