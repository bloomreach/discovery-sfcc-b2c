'use strict';

/* eslint-disable no-unused-expressions */

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru();
var path = require('path');

var defPath = path.join(
    process.cwd(),
    'cartridges/int_bloomreach/cartridge/scripts/bloomreach/services/serviceDataHubDefinition.js'
);

/**
 * Load serviceDataHubDefinition with stubbed dw dependencies, capturing the
 * config object passed to LocalServiceRegistry.createService so we can drive
 * its callbacks and assert request construction.
 * @param {Object} prefs - preference name -> value
 * @returns {Object} - { init, captured }
 */
function load(prefs) {
    var captured = {};
    var def = proxyquire(defPath, {
        '*/cartridge/scripts/bloomreach/lib/libBloomreach': {
            getPreference: function (id) { return prefs[id]; }
        },
        'dw/util/StringUtils': {
            encodeBase64: function (s) { return Buffer.from(s, 'utf8').toString('base64'); }
        },
        'dw/svc/LocalServiceRegistry': {
            createService: function (id, config) {
                captured.id = id;
                captured.config = config;
                return { __service: true };
            }
        }
    });
    return { init: def.init, captured: captured };
}

describe('serviceDataHubDefinition', function () {
    it('registers the bloomreach.http.datahub.api service', function () {
        var loaded = load({ DataHubApiTokenName: 'name', DataHubApiTokenSecret: 'secret' });
        loaded.init();
        assert.equal(loaded.captured.id, 'bloomreach.http.datahub.api');
    });

    it('builds a Basic Auth header from token name and secret', function () {
        var loaded = load({ DataHubApiTokenName: 'tokenName', DataHubApiTokenSecret: 'tokenSecret' });
        loaded.init();

        var headers = {};
        var fakeSvc = {
            setAuthentication: function () {},
            addHeader: function (k, v) { headers[k] = v; }
        };
        loaded.captured.config.createRequest(fakeSvc, 'body');

        var expected = 'Basic ' + Buffer.from('tokenName:tokenSecret', 'utf8').toString('base64');
        assert.equal(headers.Authorization, expected);
    });

    it('does not set Content-Type in createRequest (set per call by serviceHelper)', function () {
        var loaded = load({ DataHubApiTokenName: 'n', DataHubApiTokenSecret: 's' });
        loaded.init();

        var headers = {};
        var fakeSvc = {
            setAuthentication: function () {},
            addHeader: function (k, v) { headers[k] = v; }
        };
        loaded.captured.config.createRequest(fakeSvc, null);
        assert.isUndefined(headers['Content-Type']);
        assert.property(headers, 'Authorization');
    });

    it('parses a 202 job-submission response body', function () {
        var loaded = load({});
        loaded.init();
        var parsed = loaded.captured.config.parseResponse({}, {
            statusCode: 202,
            text: '{"data":{"id":"job-1","type":"item-collections/records-update","state":"PENDING"}}'
        });
        assert.equal(parsed.data.id, 'job-1');
        assert.equal(parsed.data.state, 'PENDING');
    });

    it('returns the raw client for a non-2xx response (error mapping by caller)', function () {
        var loaded = load({});
        loaded.init();
        var client = { statusCode: 401, text: 'Unauthorized' };
        var parsed = loaded.captured.config.parseResponse({}, client);
        assert.strictEqual(parsed, client);
    });

    it('masks the Authorization credential in log messages', function () {
        var loaded = load({});
        loaded.init();
        var masked = loaded.captured.config.filterLogMessage('Authorization: Basic c2VjcmV0OnZhbHVl');
        assert.notInclude(masked, 'c2VjcmV0OnZhbHVl');
        assert.include(masked, '***');
    });
});
