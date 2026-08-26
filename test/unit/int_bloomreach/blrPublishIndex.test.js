'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru();
var path = require('path');

var scriptPath = path.join(
    process.cwd(),
    'cartridges/int_bloomreach/cartridge/scripts/jobs/blrPublishIndex.js'
);

var noopLogger = { info: function () {}, warn: function () {}, error: function () {} };

/**
 * Build a CustomObjectMgr-style iterator over the given records.
 * @param {Array<Object>} records - custom objects ({ custom: { jobId, source } })
 * @param {Array<Object>} removed - array that removed records get pushed to
 * @returns {Object} - CustomObjectMgr stub
 */
function customObjectMgr(records, removed) {
    var idx = 0;
    return {
        getAllCustomObjects: function () {
            idx = 0;
            return {
                getCount: function () { return records.length; },
                hasNext: function () { return idx < records.length; },
                next: function () { var r = records[idx]; idx += 1; return r; }
            };
        },
        remove: function (co) { removed.push(co); }
    };
}

/**
 * Load blrPublishIndex with stubs. `calls` tracks which status endpoints ran.
 * @param {Object} opts - { records, removed, calls, serviceHelper, multiLocale, locales }
 * @returns {Object} - module exports
 */
function load(opts) {
    global.request = {
        getLocale: function () { return (opts.locales && opts.locales[0]) || 'en_US'; }
    };

    return proxyquire(scriptPath, {
        'dw/system/Site': {
            getCurrent: function () {
                var locales = opts.locales || ['en_US'];
                var list = locales.slice();
                list.size = function () { return locales.length; };
                return { getAllowedLocales: function () { return list; } };
            }
        },
        'dw/system/Status': function (s) { this.status = s; },
        'dw/system/Logger': { getLogger: function () { return noopLogger; } },
        'dw/object/CustomObjectMgr': customObjectMgr(opts.records, opts.removed),
        '*/cartridge/scripts/bloomreach/services/serviceHelper': opts.serviceHelper,
        '*/cartridge/scripts/bloomreach/helpers/blmHelper': opts.blmHelper || { saveIdToCustomObj: function () {} },
        '*/cartridge/scripts/bloomreach/lib/libBloomreach': {
            getPreference: function () { return !!opts.multiLocale; }
        }
    });
}

describe('blrPublishIndex - Data Hub-aware job polling', function () {
    it('polls Data Hub job ids on the Data Hub endpoint and removes terminal ones only', function () {
        var removed = [];
        var calls = { datahub: [], catalog: [] };
        var records = [
            { custom: { jobId: 'dh-done', source: 'datahub' } },
            { custom: { jobId: 'dh-pending', source: 'datahub' } }
        ];
        var serviceHelper = {
            getDataHubJobStatus: function (id) {
                calls.datahub.push(id);
                var state = id === 'dh-done' ? 'success' : 'pending';
                return { ok: true, object: { data: { state: state } } };
            },
            getJobStatus: function (id) { calls.catalog.push(id); return { ok: false, msg: 'should not be called' }; },
            publishIndex: function () { return { isOk: function () { return true; }, object: { jobId: 'x' } }; }
        };

        var mod = load({ records: records, removed: removed, serviceHelper: serviceHelper });
        mod.execute({ Enabled: true, FeedType: 'Product' });

        // Both Data Hub ids polled on the Data Hub endpoint; catalog endpoint untouched.
        assert.deepEqual(calls.datahub, ['dh-done', 'dh-pending']);
        assert.deepEqual(calls.catalog, []);
        // Only the terminal ('success') record is cleaned up; pending survives.
        assert.equal(removed.length, 1);
        assert.equal(removed[0].custom.jobId, 'dh-done');
    });

    it('treats a record with no source as a legacy Catalog Management job', function () {
        var removed = [];
        var calls = { datahub: [], catalog: [] };
        var records = [{ custom: { jobId: 'cat-legacy' } }, { custom: { jobId: 'cat-open' } }];
        var serviceHelper = {
            getDataHubJobStatus: function (id) { calls.datahub.push(id); return { ok: false, msg: 'nope' }; },
            getJobStatus: function (id) {
                calls.catalog.push(id);
                return { ok: true, object: { status: id === 'cat-legacy' ? 'success' : 'running' } };
            },
            publishIndex: function () { return { isOk: function () { return true; }, object: { jobId: 'x' } }; }
        };

        var mod = load({ records: records, removed: removed, serviceHelper: serviceHelper });
        mod.execute({ Enabled: true, FeedType: 'Product' });

        assert.deepEqual(calls.catalog, ['cat-legacy', 'cat-open']);
        assert.deepEqual(calls.datahub, []);
        assert.equal(removed.length, 1);
        assert.equal(removed[0].custom.jobId, 'cat-legacy');
    });

    it('matches Data Hub terminal states case-insensitively', function () {
        var removed = [];
        var records = [
            { custom: { jobId: 'a', source: 'datahub' } },
            { custom: { jobId: 'b', source: 'datahub' } },
            { custom: { jobId: 'c', source: 'datahub' } }
        ];
        var states = { a: 'FAIL', b: 'PENDING', c: 'Canceled' };
        var serviceHelper = {
            getDataHubJobStatus: function (id) { return { ok: true, object: { data: { state: states[id] } } }; },
            getJobStatus: function () { return { ok: false, msg: 'x' }; },
            publishIndex: function () { return { isOk: function () { return true; }, object: { jobId: 'x' } }; }
        };

        var mod = load({ records: records, removed: removed, serviceHelper: serviceHelper });
        mod.execute({ Enabled: true, FeedType: 'Product' });

        // FAIL and Canceled are terminal; PENDING is not.
        assert.equal(removed.length, 2);
        var removedIds = removed.map(function (r) { return r.custom.jobId; });
        assert.includeMembers(removedIds, ['a', 'c']);
        assert.notInclude(removedIds, 'b');
    });

    it('when all jobs are cleared, publishIndex runs and saves the new id as source "catalog"', function () {
        var removed = [];
        var saved = [];
        var serviceHelper = {
            getDataHubJobStatus: function () { return { ok: true, object: { data: { state: 'success' } } }; },
            getJobStatus: function () { return { ok: true, object: { status: 'success' } }; },
            publishIndex: function () { return { isOk: function () { return true; }, object: { jobId: 'new-job' } }; }
        };
        var blmHelper = { saveIdToCustomObj: function (id, source) { saved.push({ id: id, source: source }); } };

        // Start with one datahub job that resolves terminal -> counter hits 0 -> publish.
        var mod = load({
            records: [{ custom: { jobId: 'dh', source: 'datahub' } }],
            removed: removed,
            serviceHelper: serviceHelper,
            blmHelper: blmHelper,
            locales: ['en_US']
        });
        mod.execute({ Enabled: true, FeedType: 'Product' });

        assert.equal(removed.length, 1);
        assert.equal(saved.length, 1);
        assert.equal(saved[0].id, 'new-job');
        assert.equal(saved[0].source, 'catalog');
    });
});
