'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru();
var path = require('path');

var helperPath = path.join(
    process.cwd(),
    'cartridges/int_bloomreach/cartridge/scripts/bloomreach/services/serviceHelper.js'
);

// serviceHelper pulls in dw/* and cartridge-relative modules; stub them all so we
// can exercise the pure Data Hub URL / collection builders in plain Node.
var serviceHelper = proxyquire(helperPath, {
    'dw/system/Logger': { getLogger: function () { return { error: function () {}, info: function () {}, warn: function () {} }; } },
    '*/cartridge/scripts/bloomreach/services/serviceDefinition': {},
    '*/cartridge/scripts/bloomreach/services/serviceFileOverHttp': {},
    '*/cartridge/scripts/bloomreach/lib/libBloomreach': { getPreference: function () { return null; } }
});

describe('serviceHelper Data Hub request construction', function () {
    describe('buildDataHubRecordsUrl', function () {
        it('builds the records endpoint with update_mode query param', function () {
            var url = serviceHelper.buildDataHubRecordsUrl({
                baseUrl: 'https://api.bloomreach.com',
                workspaceId: 'ws-123',
                collectionName: 'catalog',
                itemType: 'product',
                updateMode: 'full'
            });
            assert.equal(url,
                'https://api.bloomreach.com/api/cde/v1/workspaces/ws-123'
                + '/item-collections/catalog/item-types/product/records?update_mode=full');
        });

        it('trims a trailing slash on the base URL and defaults itemType to product', function () {
            var url = serviceHelper.buildDataHubRecordsUrl({
                baseUrl: 'https://api.bloomreach.com/',
                workspaceId: 'ws-1',
                collectionName: 'c',
                updateMode: 'delta'
            });
            assert.equal(url,
                'https://api.bloomreach.com/api/cde/v1/workspaces/ws-1'
                + '/item-collections/c/item-types/product/records?update_mode=delta');
        });
    });

    describe('buildDataHubJobUrl', function () {
        it('builds the job status endpoint', function () {
            var url = serviceHelper.buildDataHubJobUrl({
                baseUrl: 'https://api.bloomreach.com',
                workspaceId: 'ws-9',
                jobId: 'job-abc'
            });
            assert.equal(url, 'https://api.bloomreach.com/api/cde/v1/workspaces/ws-9/jobs/job-abc');
        });
    });

    describe('resolveDataHubCollection', function () {
        var map = '{"default":"catalog","fr_CA":"catalog_fr"}';

        it('resolves a per-locale collection when present', function () {
            assert.equal(serviceHelper.resolveDataHubCollection(map, 'fr_CA'), 'catalog_fr');
        });

        it('falls back to the default key for an unmapped locale', function () {
            assert.equal(serviceHelper.resolveDataHubCollection(map, 'en_CA'), 'catalog');
        });

        it('uses default when locale is empty (single-locale)', function () {
            assert.equal(serviceHelper.resolveDataHubCollection(map, ''), 'catalog');
        });

        it('returns null for invalid JSON', function () {
            assert.isNull(serviceHelper.resolveDataHubCollection('not json', 'en_CA'));
        });

        it('returns null when neither locale nor default resolves', function () {
            assert.isNull(serviceHelper.resolveDataHubCollection('{"de":"x"}', 'en_CA'));
        });
    });

    describe('buildDataHubUploadUrlsUrl', function () {
        it('builds the upload-urls endpoint', function () {
            var url = serviceHelper.buildDataHubUploadUrlsUrl({
                baseUrl: 'https://api.bloomreach.com',
                workspaceId: 'ws-2'
            });
            assert.equal(url, 'https://api.bloomreach.com/api/cde/v1/workspaces/ws-2/upload-urls');
        });
    });

    describe('buildFileReferenceBody', function () {
        it('wraps file paths in a file_paths body', function () {
            assert.equal(
                serviceHelper.buildFileReferenceBody(['catalog_p001.jsonl.gz']),
                '{"file_paths":["catalog_p001.jsonl.gz"]}'
            );
        });
    });

    describe('parseDataHubError', function () {
        it('parses a 429 body and exposes context.retry_after_seconds', function () {
            var body = JSON.stringify({
                title: 'Rate limit exceeded',
                type: 'bloomreach/datahub/rate-limit',
                status: 429,
                detail: 'Too many requests',
                context: {
                    job_type: 'item-collections/records-update',
                    retry_after_seconds: 11,
                    workspace_id: 'ws-1',
                    collection_name: 'catalog'
                }
            });
            var parsed = serviceHelper.parseDataHubError(body);
            assert.equal(parsed.status, 429);
            assert.equal(parsed.context.retry_after_seconds, 11);
        });

        it('parses a 413 body and exposes payload size context', function () {
            var body = JSON.stringify({
                title: 'Payload too large',
                type: 'bloomreach/datahub/payload-too-large',
                status: 413,
                detail: 'Request body exceeds limit',
                context: { payload_size_bytes: 1048961, max_payload_size_bytes: 1048576 }
            });
            var parsed = serviceHelper.parseDataHubError(body);
            assert.equal(parsed.status, 413);
            assert.equal(parsed.context.payload_size_bytes, 1048961);
            assert.equal(parsed.context.max_payload_size_bytes, 1048576);
        });

        it('degrades gracefully on a non-JSON body', function () {
            var parsed = serviceHelper.parseDataHubError('gateway timeout');
            assert.equal(parsed.detail, 'gateway timeout');
        });

        it('returns an empty object for an empty body', function () {
            assert.deepEqual(serviceHelper.parseDataHubError(''), {});
        });
    });
});
