'use strict';

/**
 * Bloomreach Data Hub Item Collections API service definition.
 *
 * Parallel to serviceDefinition.js (Catalog Management API), but a different
 * surface: HTTP Basic Auth built from an API token name/secret pair (site
 * preferences) instead of query-string auth_key. The request URL is set by the
 * caller (serviceHelper) because it varies per workspace / collection / item-type.
 *
 * @returns {dw.svc.HTTPService} - service object
 */
function init() {
    var libBloomreach = require('*/cartridge/scripts/bloomreach/lib/libBloomreach');
    var StringUtils = require('dw/util/StringUtils');
    var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');

    var tokenName = libBloomreach.getPreference('DataHubApiTokenName') || '';
    var tokenSecret = libBloomreach.getPreference('DataHubApiTokenSecret') || '';
    var basicAuth = StringUtils.encodeBase64(tokenName + ':' + tokenSecret);

    var initService = LocalServiceRegistry.createService('bloomreach.http.datahub.api', {
        createRequest: function (service, params) {
            service.setAuthentication('NONE');
            service.addHeader('Authorization', 'Basic ' + basicAuth);
            // Content-Type is set per call by serviceHelper: json-patch+jsonlines for a
            // direct records body, application/json for file-reference / upload-url bodies.
            return params;
        },

        parseResponse: function (service, client) {
            switch (client.statusCode) {
                // 200 (job status query) and 202 (records update accepted)
                case 200:
                case 202:
                    try {
                        return JSON.parse(client.text);
                    } catch (e) {
                        return {
                            error: true,
                            errorMsg: 'Unable to parse response object ' + client.text,
                            responseStr: client.text
                        };
                    }
                default:
                    return client; // non-2xx: return raw client for error mapping by caller
            }
        },

        filterLogMessage: function (msg) {
            // never log the Basic Auth credential
            return msg ? msg.replace(/(Authorization:\s*Basic\s+)\S+/gi, '$1***') : msg;
        }
    });

    return initService;
}

module.exports.init = init;
