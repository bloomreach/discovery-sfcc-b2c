'use strict';

/**
 * Bloomreach Data Connect v3 helper.
 *
 * Every v3 resource hangs off the same catalog-scoped prefix:
 *
 *   {base}/accounts/{account_name}/catalogs/{catalog_name}/environments/{environment}/records
 *                                                                                   /indexes
 *                                                                                   /jobs/{job_id}
 *
 * so the prefix is built once in buildCatalogUrl and the resource is passed in. Catalog naming
 * is unchanged from v1 (domain key plus a language suffix); the account name and environment
 * are new and come from the blr_AccountName and blr_Environment site preferences.
 */

// API Objects
var Logger = require('dw/system/Logger').getLogger('Bloomreach', 'serviceHelperV3.js');

// BLR Helper Scripts
var serviceDefinition = require('*/cartridge/scripts/bloomreach/services/serviceDefinitionV3');
var serviceFileOverHttp = require('*/cartridge/scripts/bloomreach/services/serviceFileOverHttpV3');
var libBloomreach = require('*/cartridge/scripts/bloomreach/lib/libBloomreach');

/**
 * Get language of locale
 *
 * Carried over from the v1 helper unchanged, including the asymmetry that an 'en' locale
 * produces no suffix for products but does produce '_en' for items.
 *
 * @param {string} locale - SFCC locale name
 * @param {string} type - feed data type, 'products' or 'items'
 * @returns {string} - language suffix of locale, or an empty string
 */
function getLanguageOfLocale(locale, type) {
    if (!locale) { return ''; }

    var language = locale.split('_');
    return (!language[0] || (language[0] === 'en' && type !== 'items')) ? '' : '_' + language[0];
}

/**
 * Get the Bloomreach catalog name for a feed type and locale
 * @param {string} type - feed data type, 'products' or 'items'
 * @param {string} locale - SFCC locale name
 * @returns {string} - catalog name
 */
function getCatalogName(type, locale) {
    var catalogName = type === 'items'
        ? libBloomreach.getPreference('ContentDomainKey')
        : libBloomreach.getPreference('DomainKey');

    return catalogName + getLanguageOfLocale(locale, type);
}

/**
 * Get the configured target Bloomreach environment
 * @returns {string} - 'staging' or 'production'
 */
function getEnvironment() {
    return libBloomreach.getPreference('Environment') || 'staging';
}

/**
 * Build a v3 catalog-scoped resource URL
 * @param {dw.svc.HTTPService} service - initialised service
 * @param {string} resource - resource path below the environment, e.g. 'records' or 'jobs/123'
 * @param {string} type - feed data type, 'products' or 'items'
 * @param {string} locale - SFCC locale name
 * @param {string} [environment] - target environment; falls back to the site preference
 * @returns {string} - absolute v3 URL
 */
function buildCatalogUrl(service, resource, type, locale, environment) {
    var accountName = libBloomreach.getPreference('AccountName');
    var catalogName = getCatalogName(type, locale);
    var targetEnvironment = environment || getEnvironment();

    // Without these the request would resolve to a path containing 'null' and fail as an
    // opaque 404, so fail with something the job log can act on instead.
    if (!accountName) {
        throw new Error('Bloomreach v3: blr_AccountName site preference is not set');
    }
    if (!catalogName) {
        throw new Error('Bloomreach v3: no domain key configured for feed type ' + type);
    }

    return service.getURL()
        + 'accounts/' + accountName
        + '/catalogs/' + catalogName
        + '/environments/' + targetEnvironment
        + '/' + resource;
}

/**
 * Get Bloomreach job status
 *
 * v3 nests jobs under the catalog and environment, so unlike v1 this cannot be resolved from
 * the job ID alone. The type, locale and environment recorded on the blm_FeedJobId custom
 * object at submit time supply the rest.
 *
 * @param {string} jobId - Bloomreach job ID
 * @param {string} type - feed data type, 'products' or 'items'
 * @param {string} locale - SFCC locale name the feed was generated for
 * @param {string} [environment] - environment the job was submitted to
 * @returns {dw.svc.Result} - service response
 */
function getJobStatus(jobId, type, locale, environment) {
    var service = serviceDefinition.init();
    service.addHeader('Content-Type', 'application/json');
    service.setRequestMethod('GET');
    service.setURL(buildCatalogUrl(service, 'jobs/' + jobId, type, locale, environment));

    return service.call();
}

/**
 * Send feed data to the Bloomreach API
 * @param {string} method - API method PUT || PATCH
 * @param {Object} data - sending data
 * @param {string} type - feed data type, 'products' or 'items'
 * @param {string} locale - SFCC locale name
 * @returns {dw.svc.Result} - service response
 */
function sendFeedData(method, data, type, locale) {
    var service = serviceDefinition.init();
    service.setRequestMethod(method);
    service.addHeader('Content-Type', 'application/json');
    service.setURL(buildCatalogUrl(service, 'records', type, locale));

    var body = '';
    try {
        body = JSON.stringify(data);
    } catch (error) {
        Logger.error('Wrong data');
    }

    return service.call(body);
}

/**
 * Send JSON Lines product data to the Bloomreach API
 * @param {string} method - API method PUT || PATCH
 * @param {Object} data - sending data
 * @param {string} type - feed data type, 'products' or 'items'
 * @param {string} locale - SFCC locale name
 * @returns {dw.svc.Result} - service response
 */
function sendLinesFeedData(method, data, type, locale) {
    var service = serviceDefinition.init();
    service.setRequestMethod(method);
    service.addHeader('Content-Type', 'application/json-patch+jsonlines');
    service.setURL(buildCatalogUrl(service, 'records', type, locale));

    return service.call(data);
}

/**
 * Send a file of JSON Lines feed data to the Bloomreach API over http
 * @param {string} method - API method PUT || PATCH
 * @param {dw.io.File} data - feed file to send
 * @param {string} type - feed data type, 'products' or 'items'
 * @param {string} locale - SFCC locale name
 * @returns {dw.svc.Result} - service response
 */
function sendFileFeedData(method, data, type, locale) {
    var service = serviceFileOverHttp.init();
    service.setRequestMethod(method);
    service.addHeader('Content-Type', 'application/json-patch+jsonlines');
    service.setURL(buildCatalogUrl(service, 'records', type, locale));

    // serviceFileOverHttpV3 needs the type to decide where to stage the gzip archive.
    return service.call({ file: data, type: type });
}

/**
 * Publish Bloomreach indexes
 * @param {string} locale - SFCC locale name
 * @param {string} type - feed data type, 'products' or 'items'
 * @returns {dw.svc.Result} - service response
 */
function publishIndex(locale, type) {
    var service = serviceDefinition.init();
    service.addHeader('Content-Type', 'application/json');
    service.setRequestMethod('POST');
    service.setURL(buildCatalogUrl(service, 'indexes', type, locale));

    return service.call();
}

module.exports = {
    getJobStatus: getJobStatus,
    sendLinesFeedData: sendLinesFeedData,
    sendFileFeedData: sendFileFeedData,
    sendFeedData: sendFeedData,
    publishIndex: publishIndex,
    getEnvironment: getEnvironment
};
