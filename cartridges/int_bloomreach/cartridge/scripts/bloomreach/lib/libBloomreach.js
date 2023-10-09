'use strict';

var Logger = require('dw/system/Logger').getLogger('Bloomreach', 'libBloomreach.js');

/**
 * @description Getting preference for Bloomreach
 * @param {string} id - name of preference
 * @returns {*} - value of preference
 */
function getPreference(id) {
    var currentSite = require('dw/system/Site').getCurrent();
    return currentSite.getCustomPreferenceValue('blr_' + id);
}

/**
 * Get configuration of Bloomreach product attributes
 * @returns {Object} - config object
 */
function getProductAttributes() {
    // TODO: Add marging PRODUCT_REQUIRED_FIELDS and fields from castom site preference
    // var { PRODUCT_REQUIRED_FIELDS } = require('*/cartridge/scripts/bloomreach/lib/constants');

    var configProductFields = getPreference('ProductFields');
    var result = null;
    try {
        result = JSON.parse(configProductFields);
    } catch (error) {
        Logger.error('Invalid product attribute configuration in blr_ProductFields custom preference');
        throw new Error('Invalid product attribute configuration in blr_ProductFields custom preference');
    }

    return result;
}

/**
 * Get Bloomreach View ID
 * @returns {string} - View ID
 */
function getViewId() {
    var currentSession = request.getSession();
    var currentCurrency = currentSession.getCurrency();
    return currentCurrency.currencyCode.toLowerCase();
}

module.exports = {
    getPreference: getPreference,
    getProductAttributes: getProductAttributes,
    getViewId: getViewId
};
