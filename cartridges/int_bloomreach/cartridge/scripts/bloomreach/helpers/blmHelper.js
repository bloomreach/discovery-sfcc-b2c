'use strict';

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Transaction = require('dw/system/Transaction');
var UUIDUtils = require('dw/util/UUIDUtils');
var Logger = require('dw/system/Logger').getLogger('Bloomreach', 'blmHelper.js');

/**
 * Store Boomreach job ID to the Custom object
 * @param {string} jobId - bloomreach job ID
 * @param {string} [source] - which API the job id came from: 'catalog' (Catalog
 *  Management API) or 'datahub' (Data Hub Item Collections API). Determines which
 *  status endpoint blrPublishIndex polls to confirm completion and clean up the
 *  record. Defaults to 'catalog' to preserve legacy behavior when omitted.
 * @returns {boolean} - success result
 */
function saveIdToCustomObj(jobId, source) {
    Transaction.wrap(function () { // eslint-disable-line consistent-return
        try {
            var blmFeedJobId = CustomObjectMgr.createCustomObject('blm_FeedJobId', UUIDUtils.createUUID());
            blmFeedJobId.custom.jobId = jobId;
            blmFeedJobId.custom.source = source || 'catalog';
        } catch (error) {
            Logger.error('Exception caught during product feed upload: {0}', error.message);
            return false;
        }
    });
    return true;
}

module.exports = {
    saveIdToCustomObj: saveIdToCustomObj
};
