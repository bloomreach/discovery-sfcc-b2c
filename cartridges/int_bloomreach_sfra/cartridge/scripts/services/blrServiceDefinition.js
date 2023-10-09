'use strict';

/**
 * Bloomreach API Service definition file
 * @param {string} serviceName - name of service
 * @returns {dw.svc.HTTPService} - service object
 */
function init(serviceName) {
    var initService = require('dw/svc/LocalServiceRegistry').createService(serviceName || 'bloomreach.http.search.api', {
        createRequest: function (service, params) {
            service.setAuthentication('NONE');
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
