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

/**
 * URL safe formats query string
 * @param {string} query - query string
 * @returns {string} - URL safe formaed query string
 */
function formatSearchPhrase(query) {
    if (!query) return '';
    var str = unescape(query).trim();
    return str ? encodeURI(query) : '*';
}

/**
 * Get the User ID for the Bloomreach pixel
 * @returns {string} - View ID
 */
function getUserId() {
    var currentSession = request.getSession();
    var currentCustomer = currentSession.getCustomer();
    var userId = '';

    if (currentCustomer.authenticated && currentCustomer.registered) {
        userId = currentCustomer.ID;
    }

    return userId;
}

/**
 * @description Getting values of Bloomreach _br_uid_2 cookie
 * @param {string} strValue - decode string value of cookie
 * @returns {Object} - values of _br_uid_2 cookie
 */
function getBrUidCookieValues(strValue) {
    var Encoding = require('dw/crypto/Encoding');
    var result = {};

    if (empty(strValue)) return result;

    var params = Encoding.fromURI(strValue).split(':');

    params.forEach(function (item) {
        var values = item.split('=');
        result[values[0]] = values[1];
    });
    return result;
}

module.exports = {
    getPreference: getPreference,
    getProductAttributes: getProductAttributes,
    getViewId: getViewId,
    formatSearchPhrase: formatSearchPhrase,
    getUserId: getUserId,
    getBrUidCookieValues: getBrUidCookieValues
};
