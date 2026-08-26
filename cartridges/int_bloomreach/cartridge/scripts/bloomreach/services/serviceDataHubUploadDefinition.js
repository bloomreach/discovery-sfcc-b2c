'use strict';

/**
 * Service for PUTting a feed file to a Data Hub pre-signed upload URL.
 *
 * The pre-signed URL (returned by the "get upload urls" call) already carries
 * its own authorization, points at Bloomreach-managed storage on a different
 * host than the API, and is set per call via setURL(). No Basic Auth header is
 * added here. The file body is sent via an execute override.
 *
 * @returns {dw.svc.HTTPService} - service object
 */
function init() {
    var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');

    var initService = LocalServiceRegistry.createService('bloomreach.http.datahub.upload.api', {
        createRequest: function (service, params) {
            service.setAuthentication('NONE');
            return params;
        },

        executeOverride: true,
        execute: function (svc, params) {
            // params is the dw.io.File to upload (already gzipped, .gz extension).
            svc.client.send(params);
        },

        parseResponse: function (service, client) {
            var localClient = client || service.client;
            return localClient;
        },

        filterLogMessage: function (msg) {
            return msg;
        }
    });

    return initService;
}

module.exports.init = init;
