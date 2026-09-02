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
 * @param {string} type - feed data type
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

// ----------------------------------------------------------------------------
// Bloomreach Data Hub Item Collections API (product feed delivery only).
// Additive: these helpers are used only when blr_ProductFeedDeliveryMode=DataHub.
// The Catalog Management functions above are unchanged and remain the default.
// ----------------------------------------------------------------------------

/**
 * Build the Data Hub "update records" endpoint URL.
 * Pure/testable - no SFCC API dependencies.
 * @param {Object} cfg - { baseUrl, workspaceId, collectionName, itemType, updateMode }
 * @returns {string} - full records endpoint URL
 */
function buildDataHubRecordsUrl(cfg) {
    var base = String(cfg.baseUrl || '').replace(/\/+$/, '');
    return base
        + '/api/cde/v1/workspaces/' + cfg.workspaceId
        + '/item-collections/' + cfg.collectionName
        + '/item-types/' + (cfg.itemType || 'product')
        + '/records?update_mode=' + cfg.updateMode;
}

/**
 * Build the Data Hub "get job" endpoint URL.
 * Pure/testable - no SFCC API dependencies.
 * @param {Object} cfg - { baseUrl, workspaceId, jobId }
 * @returns {string} - full job status URL
 */
function buildDataHubJobUrl(cfg) {
    var base = String(cfg.baseUrl || '').replace(/\/+$/, '');
    return base + '/api/cde/v1/workspaces/' + cfg.workspaceId + '/jobs/' + cfg.jobId;
}

/**
 * Build the Data Hub "get upload urls" endpoint URL.
 * Pure/testable - no SFCC API dependencies.
 * @param {Object} cfg - { baseUrl, workspaceId }
 * @returns {string} - full upload-urls URL
 */
function buildDataHubUploadUrlsUrl(cfg) {
    var base = String(cfg.baseUrl || '').replace(/\/+$/, '');
    return base + '/api/cde/v1/workspaces/' + cfg.workspaceId + '/upload-urls';
}

/**
 * Build a Data Hub file-reference request body (also used for the upload-urls call).
 * Pure/testable.
 * @param {Array<string>} filePaths - file path strings
 * @returns {string} - JSON body { "file_paths": [...] }
 */
function buildFileReferenceBody(filePaths) {
    return JSON.stringify({ file_paths: filePaths });
}

/**
 * Parse a Data Hub RFC-7807-style error body.
 * Shape: { title, type, status, detail, context }. On 429 the context carries
 * retry_after_seconds; on 413 it carries payload_size_bytes / max_payload_size_bytes.
 * Pure/testable.
 * @param {string} text - raw response body
 * @returns {Object} - parsed error fields (best-effort)
 */
function parseDataHubError(text) {
    if (!text) { return {}; }
    try {
        var obj = JSON.parse(text);
        return {
            title: obj.title,
            type: obj.type,
            status: obj.status,
            detail: obj.detail,
            context: obj.context
        };
    } catch (e) {
        return { detail: String(text) };
    }
}

/**
 * Resolve the Data Hub item-collection name for a given locale from the
 * blr_DataHubCollectionMap JSON preference. An explicit map avoids the naming
 * pitfalls of any string-suffix-derived scheme. Falls back to a "default" key.
 * Pure/testable - no SFCC API dependencies.
 * @param {string} mapJson - JSON string, e.g. {"default":"catalog","fr_CA":"catalog_fr"}
 * @param {string} locale - SFCC locale name (may be empty for single-locale)
 * @returns {string|null} - collection name, or null if unresolved
 */
function resolveDataHubCollection(mapJson, locale) {
    var map;
    try {
        map = JSON.parse(mapJson);
    } catch (e) {
        return null;
    }
    if (!map || typeof map !== 'object') { return null; }
    if (locale && map[locale]) { return map[locale]; }
    return map.default || null;
}

/**
 * Get Data Hub configuration from site preferences.
 * @returns {Object} - config values
 */
function getDataHubConfig() {
    return {
        baseUrl: libBloomreach.getPreference('DataHubBaseUrl'),
        workspaceId: libBloomreach.getPreference('DataHubWorkspaceId'),
        itemType: libBloomreach.getPreference('DataHubItemType') || 'product',
        collectionMap: libBloomreach.getPreference('DataHubCollectionMap')
    };
}

/**
 * Send a (already Data Hub-shaped) JSONLines feed file to the Item Collections API.
 * @param {dw.io.File} file - JSONLines file in Data Hub patch shape
 * @param {string} updateMode - 'full' or 'delta'
 * @param {string} collectionName - target item-collection name
 * @returns {dw.svc.Result} - service response
 */
function sendDataHubFeedData(file, updateMode, collectionName) {
    var serviceDataHubDefinition = require('*/cartridge/scripts/bloomreach/services/serviceDataHubRecordsDefinition');
    var cfg = getDataHubConfig();

    var service = serviceDataHubDefinition.init();
    service.setRequestMethod('POST');
    service.addHeader('Content-Type', 'application/json-patch+jsonlines');
    service.setURL(buildDataHubRecordsUrl({
        baseUrl: cfg.baseUrl,
        workspaceId: cfg.workspaceId,
        collectionName: collectionName,
        itemType: cfg.itemType,
        updateMode: updateMode
    }));

    return service.call(file);
}

/**
 * Request pre-signed upload URLs for the given file paths (large-feed flow).
 * @param {Array<string>} filePaths - file names to upload
 * @returns {dw.svc.Result} - service response ({ data: [{ file_path, url, ... }] })
 */
function getDataHubUploadUrls(filePaths) {
    var serviceDataHubDefinition = require('*/cartridge/scripts/bloomreach/services/serviceDataHubDefinition');
    var cfg = getDataHubConfig();

    var service = serviceDataHubDefinition.init();
    service.setRequestMethod('POST');
    service.addHeader('Content-Type', 'application/json');
    service.setURL(buildDataHubUploadUrlsUrl({ baseUrl: cfg.baseUrl, workspaceId: cfg.workspaceId }));

    return service.call(buildFileReferenceBody(filePaths));
}

/**
 * PUT a (gzipped JSONLines) feed file to a Data Hub pre-signed upload URL.
 * @param {string} url - pre-signed upload URL
 * @param {dw.io.File} file - gzipped feed file
 * @returns {dw.svc.Result} - service response
 */
function uploadFileToSignedUrl(url, file) {
    var serviceDataHubUploadDefinition = require('*/cartridge/scripts/bloomreach/services/serviceDataHubUploadDefinition');
    var service = serviceDataHubUploadDefinition.init();
    service.setRequestMethod('PUT');
    service.setURL(url);
    return service.call(file);
}

/**
 * Submit a records update that references previously uploaded files
 * (large-feed flow) rather than an inline JSONLines body.
 * @param {Array<string>} filePaths - uploaded file paths to reference
 * @param {string} updateMode - 'full' or 'delta'
 * @param {string} collectionName - target item-collection name
 * @returns {dw.svc.Result} - service response
 */
function sendDataHubFileReference(filePaths, updateMode, collectionName) {
    var serviceDataHubDefinition = require('*/cartridge/scripts/bloomreach/services/serviceDataHubDefinition');
    var cfg = getDataHubConfig();

    var service = serviceDataHubDefinition.init();
    service.setRequestMethod('POST');
    service.addHeader('Content-Type', 'application/json');
    service.setURL(buildDataHubRecordsUrl({
        baseUrl: cfg.baseUrl,
        workspaceId: cfg.workspaceId,
        collectionName: collectionName,
        itemType: cfg.itemType,
        updateMode: updateMode
    }));

    return service.call(buildFileReferenceBody(filePaths));
}

/**
 * Query Data Hub for the status of a previously submitted records-update job.
 * @param {string} jobId - Data Hub job id
 * @returns {dw.svc.Result} - service response ({ data: { id, type, state } })
 */
function getDataHubJobStatus(jobId) {
    var serviceDataHubDefinition = require('*/cartridge/scripts/bloomreach/services/serviceDataHubDefinition');
    var cfg = getDataHubConfig();

    var service = serviceDataHubDefinition.init();
    service.setRequestMethod('GET');
    service.setURL(buildDataHubJobUrl({
        baseUrl: cfg.baseUrl,
        workspaceId: cfg.workspaceId,
        jobId: jobId
    }));

    return service.call();
}

/**
 * Publish Bloomreach indexes
 * @param {string} locale - locale name
 * @param {string} type - feed data type
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
    publishIndex: publishIndex,
    // Data Hub (product feed delivery only)
    sendDataHubFeedData: sendDataHubFeedData,
    sendDataHubFileReference: sendDataHubFileReference,
    getDataHubUploadUrls: getDataHubUploadUrls,
    uploadFileToSignedUrl: uploadFileToSignedUrl,
    getDataHubJobStatus: getDataHubJobStatus,
    parseDataHubError: parseDataHubError,
    buildDataHubRecordsUrl: buildDataHubRecordsUrl,
    buildDataHubJobUrl: buildDataHubJobUrl,
    buildDataHubUploadUrlsUrl: buildDataHubUploadUrlsUrl,
    buildFileReferenceBody: buildFileReferenceBody,
    resolveDataHubCollection: resolveDataHubCollection
};
