'use strict';

/**
 * Bloomreach Data Connect v3 API service definition file for sending a feed file over http
 *
 * Expects the service to be called with { file: dw.io.File, type: string }, where type is
 * 'products' or 'items'. The type selects the directory the gzip is staged in, so a content
 * feed is no longer archived into the product feed folder, and the archive is named after the
 * source feed file (which already carries a timestamp and locale) so that two jobs running at
 * once cannot overwrite each other's archive.
 *
 * @param {string} serviceName - name of service
 * @returns {dw.svc.HTTPService} - service object
 */
function init(serviceName) {
    var apiKey = require('*/cartridge/scripts/bloomreach/lib/libBloomreach').getPreference('ApiKey');
    var initService = require('dw/svc/LocalServiceRegistry').createService(serviceName || 'bloomreach.http.api.v3', {
        createRequest: function (service, params) {
            service.setAuthentication('NONE');
            service.addHeader('Authorization', 'Bearer ' + apiKey);
            service.addHeader('Accept', 'application/json');
            service.addHeader('Content-Encoding', 'gzip');
            return params;
        },
        executeOverride: true,
        execute: function (svc, params) {
            var File = require('dw/io/File');
            var constants = require('*/cartridge/scripts/bloomreach/lib/constants');

            var localPath = params.type === 'items'
                ? constants.CONTENT_FEED_LOCAL_PATH
                : constants.PRODUCT_FEED_LOCAL_PATH;

            var gzipFile = new File([File.TEMP, localPath, params.file.name + '.gz'].join(File.SEPARATOR));

            try {
                params.file.gzip(gzipFile);
                svc.client.send(gzipFile);
            } finally {
                if (gzipFile.exists()) {
                    gzipFile.remove();
                }
            }
        },

        parseResponse: function (service, client) {
            var localClient = client || service.client;

            // See serviceDefinitionV3.js: any 2xx is parsed, anything else is an error.
            if (localClient.statusCode >= 200 && localClient.statusCode < 300) {
                try {
                    return JSON.parse(localClient.text);
                } catch (e) {
                    return {
                        error: true,
                        errorMsg: 'Unable to parse response object ' + localClient.text,
                        responseStr: localClient.text
                    };
                }
            }

            throw new Error('Bloomreach v3 API responded ' + localClient.statusCode + ': '
                + (localClient.errorText || localClient.text || 'no response body'));
        },
        filterLogMessage: function (msg) {
            return msg;
        }
    });
    return initService;
}

module.exports.init = init;
