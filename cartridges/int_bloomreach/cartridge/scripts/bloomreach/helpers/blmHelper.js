'use strict';

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Transaction = require('dw/system/Transaction');
var UUIDUtils = require('dw/util/UUIDUtils');
var Logger = require('dw/system/Logger').getLogger('Bloomreach', 'blmHelper.js');

/**
 * Store Boomreach job ID to the Custom object
 * @param {string} jobId - bloomreach job ID
 *  @param {Object} [context] - job context needed to poll status on v3
 * @param {string} [context.type] - feed data type, 'products' or 'items'
 * @param {string} [context.locale] - SFCC locale the feed was generated for
 * @param {string} [context.environment] - Bloomreach environment the job was submitted to
 * @returns {boolean} - success result
 */
function saveIdToCustomObj(jobId, context) {
    Transaction.wrap(function () { // eslint-disable-line consistent-return
        try {
            var blmFeedJobId = CustomObjectMgr.createCustomObject('blm_FeedJobId', UUIDUtils.createUUID());
            blmFeedJobId.custom.jobId = jobId;

            if (context) {
                blmFeedJobId.custom.type = context.type;
                blmFeedJobId.custom.locale = context.locale;
                blmFeedJobId.custom.environment = context.environment;
            }
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
