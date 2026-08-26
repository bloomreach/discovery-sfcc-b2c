'use strict';

/**
 * Bloomreach API Service definition file for sending file over http
 * @returns {dw.svc.HTTPService} - setvise object
 */
function init() {
    var apiKey = require('*/cartridge/scripts/bloomreach/lib/libBloomreach').getPreference('ApiKey');
    var initService = require('dw/svc/LocalServiceRegistry').createService('bloomreach.http.api', {
        createRequest: function (service, params) {
            service.setAuthentication('NONE');
            service.addHeader('Authorization', 'Bearer ' + apiKey);
            service.addHeader('Content-Encoding', 'gzip ');
            return params;
        },
        executeOverride: true,
        execute: function (svc, params) {
            var client = svc.client;
            var File = require('dw/io/File');
            var gzipFile = new File([File.TEMP, 'bloomreach/product'].join(File.SEPARATOR) + '/archive.jsonl.gz');
            params.gzip(gzipFile);

            client.send(gzipFile);
            gzipFile.remove();
        },

        parseResponse: function (service, client) {
            var localClient = client || service.client;
            switch (localClient.statusCode) {
                case 200:
                    try {
                        return JSON.parse(localClient.text);
                    } catch (e) {
                        return {
                            error: true,
                            errorMsg: 'Unable to parse response object ' + localClient.text,
                            responseStr: localClient.text
                        };
                    }
                default:
                    return localClient; // reserved for implementation
            }
        },
        filterLogMessage: function (msg) {
            return msg;
        }
    });
    return initService;
}

module.exports.init = init;
