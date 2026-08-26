'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru();
var path = require('path');

var scriptPath = path.join(
    process.cwd(),
    'cartridges/int_bloomreach/cartridge/scripts/bloomreach/helpers/blmHelper.js'
);

/**
 * Load blmHelper with a capturing CustomObjectMgr stub.
 * @returns {Object} - { helper, created } where created collects created objects
 */
function load() {
    var created = [];
    var helper = proxyquire(scriptPath, {
        'dw/object/CustomObjectMgr': {
            createCustomObject: function () {
                var co = { custom: {} };
                created.push(co);
                return co;
            }
        },
        'dw/system/Transaction': { wrap: function (fn) { return fn(); } },
        'dw/util/UUIDUtils': { createUUID: function () { return 'uuid-1'; } },
        'dw/system/Logger': { getLogger: function () { return { error: function () {} }; } }
    });
    return { helper: helper, created: created };
}

describe('blmHelper.saveIdToCustomObj', function () {
    it('stores the job id and the given source', function () {
        var ctx = load();
        ctx.helper.saveIdToCustomObj('job-42', 'datahub');
        assert.equal(ctx.created.length, 1);
        assert.equal(ctx.created[0].custom.jobId, 'job-42');
        assert.equal(ctx.created[0].custom.source, 'datahub');
    });

    it('defaults source to "catalog" when omitted (legacy call shape)', function () {
        var ctx = load();
        ctx.helper.saveIdToCustomObj('job-7');
        assert.equal(ctx.created[0].custom.jobId, 'job-7');
        assert.equal(ctx.created[0].custom.source, 'catalog');
    });
});
