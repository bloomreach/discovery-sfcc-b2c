'use strict';

/**
 * Bloomreach Data Hub Item Collections API service definition for the
 * direct-records POST (delta feed).
 *
 * Identical to serviceDataHubDefinition.js (same 'bloomreach.http.datahub.api'
 * service ID, same HTTP Basic Auth from the API token name/secret site
 * preferences, same parseResponse and filterLogMessage), but adds an execute
 * override so a dw.io.File request body is streamed via svc.client.send()
 * instead of being stringified by SFCC's default execute path (which would emit
 * the File's path, not its JSONLines contents, and get rejected as an invalid
 * patch). Mirrors the proven pattern in serviceDataHubUploadDefinition.js.
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

        executeOverride: true,
        execute: function (svc, params) {
            // params is the dw.io.File (JSONLines) to stream as the request body.
            svc.client.send(params);
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
