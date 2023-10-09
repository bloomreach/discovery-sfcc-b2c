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
            params += '&' + localPrefix + key + '=' + data[key];
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
    var apiKey = libBloomreach.getPreference('ApiKey');
    var path = baseUrl + '/api/v1/core/?account_id=' + accountId + '&auth_key=' + apiKey + '&domain_key=' + domainKey;
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
    var apiKey = libBloomreach.getPreference('ApiKey');
    var path = baseUrl + '/api/v2/suggest/?account_id=' + accountId + '&auth_key=' + apiKey + '&catalog_views=' + domainKey;
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
    var apiKey = libBloomreach.getPreference('ApiKey');

    var service = serviceDefinition.init('bloomreach.http.widgets.api');
    var baseUrl = service.getURL();
    var path = baseUrl + recommendationParams.wty + '/' + recommendationParams.widget_id
        + '?account_id=' + accountId
        + '&auth_key=' + apiKey
        + '&domain_key=' + domainKey
        + '&_br_uid_2=' + recommendationParams.brUid2;

    Object.keys(recommendationParams).forEach(function (key) {
        if (['widget_id', 'wty', '_br_uid_2', 'brUid2'].indexOf(key) === -1) {
            path += '&' + key + '=' + recommendationParams[key];
        }
    });

    service.setURL(path);
    service.setRequestMethod('GET');
    service.addHeader('Content-Type', 'application/json');

    return service.call();
}

module.exports = {
    performSearch: performSearch,
    performSearchSuggestions: performSearchSuggestions,
    getRecommendations: getRecommendations
};
