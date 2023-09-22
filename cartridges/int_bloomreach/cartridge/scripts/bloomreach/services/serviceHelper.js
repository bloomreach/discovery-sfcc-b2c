'use strict';

// API Objects
var Logger = require('dw/system/Logger').getLogger('Bloomreach', 'serviceHelper.js');

// BLR Helper Scripts
var serviceDefinition = require('*/cartridge/scripts/bloomreach/services/serviceDefinition');
var serviceFileOverHttp = require('*/cartridge/scripts/bloomreach/services/serviceFileOverHttp');
var libBloomreach = require('*/cartridge/scripts/bloomreach/lib/libBloomreach');

/**
 * Get language of locale
 * @param {string} locale - SFCC locale name
 * @returns {string} - language of locale
 */
function getLanguageOfLocale(locale, type) {
    if (!locale) { return ''; }

    var language = locale.split('_');
    return (!language[0] || (language[0] === 'en' && type !== 'items')) ? '' : '_' + language[0];
}

/**
 * Get Bloomreach job status
 * @param {string} jobId - Bloomreach job ID
 * @returns {Object} - API response
 */
function getJobStatus(jobId) {
    var service = serviceDefinition.init();
    service.addHeader('Content-Type', 'application/json');
    service.setRequestMethod('GET');
    var baseUrl = service.getURL();
    var path = baseUrl + 'jobs/' + jobId;
    service.setURL(path);
    return service.call();
}

/**
 * Send feed data to the Bloobreach API
 * @param {string} method - API method PUT || PATCH
 * @param {Object} data - sending data
 * @param {Object} type - feed data type
 * @param {string} locale - SFCC locale name
 * @returns {Object} - service response
 */
function sendFeedData(method, data, type, locale) {
    var service = serviceDefinition.init();
    service.setRequestMethod(method);
    service.addHeader('Content-Type', 'application/json');

    var baseUrl = service.getURL();
    var accountId = libBloomreach.getPreference('AccountID');
    var domainKey = type === 'items' ? libBloomreach.getPreference('ContentDomainKey') : libBloomreach.getPreference('DomainKey');
    domainKey += getLanguageOfLocale(locale, type);

    var path = baseUrl + 'accounts/' + accountId + '/catalogs/' + domainKey + '/' + type;
    service.setURL(path);

    var body = '';
    try {
        body = JSON.stringify(data);
    } catch (error) {
        Logger.error('Wrong data');
    }

    return service.call(body);
}

/**
 * Send JSON Lines product data to the Bloobreach API
 * @param {string} method - API method PUT || PATCH
 * @param {Object} data - sending data
 * @param {Object} type - feed data type
 * @param {string} locale - locale name
 * @returns {Object} - service response
 */
function sendLinesFeedData(method, data, type, locale) {
    var service = serviceDefinition.init();
    service.setRequestMethod(method);
    service.addHeader('Content-Type', 'application/json-patch+jsonlines');

    var baseUrl = service.getURL();
    var accountId = libBloomreach.getPreference('AccountID');
    var domainKey = libBloomreach.getPreference('DomainKey');
    domainKey += getLanguageOfLocale(locale, type);

    var path = baseUrl + 'accounts/' + accountId + '/catalogs/' + domainKey + '/' + type;
    service.setURL(path);

    return service.call(data);
}

/**
 * Send file of JSON Lines product data to the Bloobreach API over http
 * @param {string} method - API method PUT || PATCH
 * @param {Object} data - sending data
 * @param {Object} type - feed data type
 * @param {string} locale - locale name
 * @returns {Object} - service response
 */
function sendFileFeedData(method, data, type, locale) {
    var service = serviceFileOverHttp.init();
    service.setRequestMethod(method);
    service.addHeader('Content-Type', 'application/json-patch+jsonlines');

    var baseUrl = service.getURL();
    var accountId = libBloomreach.getPreference('AccountID');
    var domainKey = libBloomreach.getPreference('DomainKey');
    domainKey += getLanguageOfLocale(locale, type);

    var path = baseUrl + 'accounts/' + accountId + '/catalogs/' + domainKey + '/' + type;
    service.setURL(path);

    return service.call(data);
}

/**
 * Publish Bloomreach indexes
 * @param {string} locale - locale name
 * @returns {Object} - service response
 */
function publishIndex(locale, type) {
    var service = serviceDefinition.init();
    service.addHeader('Content-Type', 'application/json');
    var baseUrl = service.getURL();
    var accountId = libBloomreach.getPreference('AccountID');
    var domainKey = type === 'items' ? libBloomreach.getPreference('ContentDomainKey') : libBloomreach.getPreference('DomainKey');
    domainKey += getLanguageOfLocale(locale, type);
    var path = baseUrl + 'accounts/' + accountId + '/catalogs/' + domainKey + '/indexes';

    service.setURL(path);
    service.setRequestMethod('POST');

    return service.call();
}

module.exports = {
    getJobStatus: getJobStatus,
    sendLinesFeedData: sendLinesFeedData,
    sendFileFeedData: sendFileFeedData,
    sendFeedData: sendFeedData,
    publishIndex: publishIndex
};
