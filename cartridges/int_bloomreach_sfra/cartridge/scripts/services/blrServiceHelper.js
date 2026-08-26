'use strict';

// API Objects
var Logger = require('dw/system/Logger').getLogger('Bloomreach', 'serviceHelper.js');

// BLR Helper Scripts
var serviceDefinition = require('*/cartridge/scripts/services/blrServiceDefinition');
var libBloomreach = require('*/cartridge/scripts/bloomreach/lib/libBloomreach');

/**
 * Map request parameters to url
 * @param {Object} data - request parameters
 * @param {string} url - url base
 * @param {spring} prefix - prefix for the paremeters
 * @returns {string} - request url
 */
function mapUrlParams(data, url, prefix) {
    if (!data) { return url; }

    var localPrefix = prefix ? prefix + '.' : '';
    var params = '';

    Object.keys(data).forEach(function (key) {
        if (typeof data[key] === 'object') {
            params = mapUrlParams(data[key], params, localPrefix + key);
        } else {
            var value = (key === 'url' || key === 'ref_url') ? require('dw/crypto/Encoding').toURI(data[key]) : data[key];
            params += '&' + localPrefix + key + '=' + value;
        }
    });

    return url + params;
}

/**
 * Perform product search via Bloomreach API
 * @param {Object} searchDetails - request parameters
 * @returns {Object} - service response
 */
function performSearch(searchDetails) {
    var service = serviceDefinition.init();
    service.setRequestMethod('GET');
    service.addHeader('Content-Type', 'application/json');

    var baseUrl = service.getURL();
    var accountId = libBloomreach.getPreference('AccountID');
    var domainKey = libBloomreach.getPreference('DomainKey');
    var authKey = libBloomreach.getPreference('AuthKey');
    var path = baseUrl + '/api/v1/core/?account_id=' + accountId + '&auth_key=' + authKey + '&domain_key=' + domainKey;
    path = mapUrlParams(searchDetails, path);
    service.setURL(path);

    return service.call();
}

/**
 * Perform search suggestions via Bloomreach API
 * @param {Object} searchDetails - request parameters
 * @returns {Object} - service response
 */
function performSearchSuggestions(searchDetails) {
    var service = serviceDefinition.init('bloomreach.http.search.suggestions.api');
    service.setRequestMethod('GET');
    service.addHeader('Content-Type', 'application/json');

    var baseUrl = service.getURL();
    var accountId = libBloomreach.getPreference('AccountID');
    var domainKey = libBloomreach.getPreference('DomainKey');
    var authKey = libBloomreach.getPreference('AuthKey');
    var path = baseUrl + '/api/v2/suggest/?account_id=' + accountId + '&auth_key=' + authKey + '&catalog_views=' + domainKey;
    path = mapUrlParams(searchDetails, path);
    service.setURL(path);

    return service.call();
}

/**
 * Get recommendations widget
 * @param {Object} recommendationParams - widget parameters
 * @returns {Object} - service response
 */
function getRecommendations(recommendationParams) {
    var accountId = libBloomreach.getPreference('AccountID');
    var domainKey = libBloomreach.getPreference('DomainKey');
    var authKey = libBloomreach.getPreference('AuthKey');
    var data = {};

    var service = serviceDefinition.init('bloomreach.http.widgets.api');
    var baseUrl = service.getURL();
    var path = baseUrl + recommendationParams.wty + '/' + recommendationParams.widget_id
        + '?account_id=' + accountId
        + '&domain_key=' + domainKey;

    Object.keys(recommendationParams).forEach(function (key) {
        if (['widget_id', 'wty'].indexOf(key) === -1) {
            data[key] = recommendationParams[key];
        }
    });

    path = mapUrlParams(data, path);

    service.setURL(path);
    service.setRequestMethod('GET');
    service.addHeader('Content-Type', 'application/json');
    service.addHeader('auth-key', authKey);

    return service.call();
}

module.exports = {
    performSearch: performSearch,
    performSearchSuggestions: performSearchSuggestions,
    getRecommendations: getRecommendations
};
