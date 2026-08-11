'use strict';

/**
 * Bloomreach Data Connect v3 API service definition file
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
            return params;
        },

        parseResponse: function (service, client) {
            // v3 record and index submissions create asynchronous jobs and may answer 202
            // rather than 200, so any 2xx is parsed. Anything else throws: the v1 definition
            // returns the raw client instead, which leaves Result.ok true and makes
            // result.object.jobId undefined, so a failed submit looks like a success.
            if (client.statusCode >= 200 && client.statusCode < 300) {
                try {
                    return JSON.parse(client.text);
                } catch (e) {
                    return {
                        error: true,
                        errorMsg: 'Unable to parse response object ' + client.text,
                        responseStr: client.text
                    };
                }
            }

            throw new Error('Bloomreach v3 API responded ' + client.statusCode + ': '
                + (client.errorText || client.text || 'no response body'));
        },
        filterLogMessage: function (msg) {
            return msg;
        }
    });
    return initService;
}

module.exports.init = init;
