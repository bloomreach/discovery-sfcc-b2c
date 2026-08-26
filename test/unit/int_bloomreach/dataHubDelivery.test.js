'use strict';

var assert = require('chai').assert;
var path = require('path');

var delivery = require(path.join(
    process.cwd(),
    'cartridges/int_bloomreach/cartridge/scripts/bloomreach/helpers/dataHubDelivery.js'
));

// ---- test fakes -------------------------------------------------------------

function okRecords(jobId) {
    return { isOk: function () { return true; }, object: { data: { id: jobId } } };
}
function errRecords(status, bodyObj) {
    return {
        isOk: function () { return false; },
        error: status,
        object: { text: JSON.stringify(bodyObj || { status: status }) }
    };
}
function okGeneric() {
    return { isOk: function () { return true; }, object: {} };
}

function fakeFile(fullPath) {
    return {
        _p: fullPath,
        getFullPath: function () { return this._p; },
        getName: function () { return this._p.split('/').pop(); },
        exists: function () { return true; },
        remove: function () { this._removed = true; return true; }
    };
}

// serviceHelper needs dw stubs; use proxyquire to reach the pure parseDataHubError.
var proxyquire = require('proxyquire').noCallThru();
var sh = proxyquire(path.join(
    process.cwd(),
    'cartridges/int_bloomreach/cartridge/scripts/bloomreach/services/serviceHelper.js'
), {
    'dw/system/Logger': { getLogger: function () { return { error: function () {}, info: function () {}, warn: function () {} }; } },
    '*/cartridge/scripts/bloomreach/services/serviceDefinition': {},
    '*/cartridge/scripts/bloomreach/services/serviceFileOverHttp': {},
    '*/cartridge/scripts/bloomreach/lib/libBloomreach': { getPreference: function () { return null; } }
});

var noopLogger = { info: function () {}, warn: function () {}, error: function () {} };

/**
 * Build a deps object with sensible defaults and spy counters, overridable per test.
 * @param {Object} over - overrides
 * @returns {Object} - deps + calls tracker
 */
function makeDeps(over) {
    var calls = { sendRecords: 0, getUploadUrls: 0, uploadFile: 0, sendFileReference: 0, waits: [] };
    var deps = {
        transformFeedFile: function () { calls.transformed = true; },
        makeFile: function (p) { return fakeFile(p); },
        gzipFile: function () { return fakeFile('/tmp/feed.jsonl.datahub.jsonl.gz'); },
        sendRecords: function () { calls.sendRecords++; return okRecords('job-direct'); },
        getUploadUrls: function () {
            calls.getUploadUrls++;
            return { isOk: function () { return true; }, object: { data: [{ file_path: 'feed.jsonl.datahub.jsonl.gz', url: 'https://storage.example/signed' }] } };
        },
        uploadFile: function () { calls.uploadFile++; return okGeneric(); },
        sendFileReference: function () { calls.sendFileReference++; return okRecords('job-file'); },
        parseError: sh.parseDataHubError,
        waitSeconds: function (s) { calls.waits.push(s); },
        logger: noopLogger,
        maxRetries: 3
    };
    Object.keys(over || {}).forEach(function (k) { deps[k] = over[k]; });
    deps.__calls = calls;
    return deps;
}

describe('dataHubDelivery.deliverProductFeed', function () {
    it('full mode uses the file-upload-with-reference flow (not direct records)', function () {
        var deps = makeDeps();
        var out = delivery.deliverProductFeed({
            updateMode: 'full',
            collectionName: 'catalog',
            srcFile: fakeFile('/tmp/feed.jsonl'),
            deps: deps
        });
        assert.isTrue(out.ok);
        assert.equal(out.jobId, 'job-file');
        assert.equal(deps.__calls.sendRecords, 0);
        assert.equal(deps.__calls.getUploadUrls, 1);
        assert.equal(deps.__calls.uploadFile, 1);
        assert.equal(deps.__calls.sendFileReference, 1);
    });

    it('delta mode posts the direct records body and returns its job id', function () {
        var deps = makeDeps();
        var out = delivery.deliverProductFeed({
            updateMode: 'delta',
            collectionName: 'catalog',
            srcFile: fakeFile('/tmp/feed.jsonl'),
            deps: deps
        });
        assert.isTrue(out.ok);
        assert.equal(out.jobId, 'job-direct');
        assert.equal(deps.__calls.sendRecords, 1);
        assert.equal(deps.__calls.getUploadUrls, 0);
    });

    it('delta 413 falls back automatically to the file-upload flow', function () {
        var deps = makeDeps({
            sendRecords: function () {
                deps.__calls.sendRecords++;
                return errRecords(413, {
                    status: 413,
                    title: 'Payload too large',
                    context: { payload_size_bytes: 1048961, max_payload_size_bytes: 1048576 }
                });
            }
        });
        var out = delivery.deliverProductFeed({
            updateMode: 'delta',
            collectionName: 'catalog',
            srcFile: fakeFile('/tmp/feed.jsonl'),
            deps: deps
        });
        assert.isTrue(out.ok);
        assert.equal(out.jobId, 'job-file');
        assert.equal(deps.__calls.sendRecords, 1);
        assert.equal(deps.__calls.getUploadUrls, 1);
        assert.equal(deps.__calls.uploadFile, 1);
        assert.equal(deps.__calls.sendFileReference, 1);
    });

    it('retries on 429 using context.retry_after_seconds, then succeeds', function () {
        var n = 0;
        var deps = makeDeps({
            sendRecords: function () {
                deps.__calls.sendRecords++;
                n++;
                if (n === 1) {
                    return errRecords(429, { status: 429, context: { retry_after_seconds: 11 } });
                }
                return okRecords('job-after-retry');
            }
        });
        var out = delivery.deliverProductFeed({
            updateMode: 'delta',
            collectionName: 'catalog',
            srcFile: fakeFile('/tmp/feed.jsonl'),
            deps: deps
        });
        assert.isTrue(out.ok);
        assert.equal(out.jobId, 'job-after-retry');
        assert.equal(deps.__calls.sendRecords, 2);
        assert.deepEqual(deps.__calls.waits, [11]);
    });

    it('gives up after maxRetries 429s and reports the status', function () {
        var deps = makeDeps({
            maxRetries: 2,
            sendRecords: function () {
                deps.__calls.sendRecords++;
                return errRecords(429, { status: 429, context: { retry_after_seconds: 1 } });
            }
        });
        var out = delivery.deliverProductFeed({
            updateMode: 'delta',
            collectionName: 'catalog',
            srcFile: fakeFile('/tmp/feed.jsonl'),
            deps: deps
        });
        assert.isFalse(out.ok);
        assert.equal(out.httpStatus, 429);
        assert.equal(deps.__calls.sendRecords, 3); // initial + 2 retries
    });
});
