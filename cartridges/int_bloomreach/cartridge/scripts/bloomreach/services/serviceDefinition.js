'use strict';

/**
 * Bloomreach API Service definition file
 * @returns {dw.svc.HTTPService} - setvise object
 */
function init() {
    var apiKey = require('*/cartridge/scripts/bloomreach/lib/libBloomreach').getPreference('ApiKey');
    var initService = require('dw/svc/LocalServiceRegistry').createService('bloomreach.http.api', {
        createRequest: function (service, params) {
            service.setAuthentication('NONE');
            service.addHeader('Authorization', 'Bearer ' + apiKey);
            return params;
        },

        parseResponse: function (service, client) {
            switch (client.statusCode) {
                case 200:
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
                    return client; // reserved for implementation
            }
        },
        filterLogMessage: function (msg) {
            return msg;
        }
    });
    return initService;
}

module.exports.init = init;
