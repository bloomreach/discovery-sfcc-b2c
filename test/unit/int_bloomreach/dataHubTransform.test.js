'use strict';

/* eslint-disable no-unused-expressions */

var assert = require('chai').assert;
var path = require('path');

var transform = require(path.join(
    process.cwd(),
    'cartridges/int_bloomreach/cartridge/scripts/bloomreach/helpers/dataHubTransform.js'
));

var toDataHubPatchRecord = transform.toDataHubPatchRecord;

describe('dataHubTransform.toDataHubPatchRecord', function () {
    it('strips the /products/ prefix from an add record path', function () {
        var out = toDataHubPatchRecord({ op: 'add', path: '/products/006', value: { attributes: {} } });
        assert.equal(out.path, '/006');
    });

    it('renames value.attributes to value.fields at product level', function () {
        var out = toDataHubPatchRecord({
            op: 'add',
            path: '/products/006',
            value: { attributes: { price: 299.99, rating: 4 } }
        });
        assert.deepEqual(out.value.fields, { price: 299.99, rating: 4 });
        assert.notProperty(out.value, 'attributes');
    });

    it('renames attributes to fields inside each variant, preserving variant IDs', function () {
        var out = toDataHubPatchRecord({
            op: 'add',
            path: '/products/006',
            value: {
                attributes: { price: 299.99 },
                variants: {
                    '372991_0': { attributes: { sku: '120546', sku_price: 299.99 } }
                }
            }
        });
        assert.deepEqual(out.value.variants['372991_0'].fields, { sku: '120546', sku_price: 299.99 });
        assert.notProperty(out.value.variants['372991_0'], 'attributes');
    });

    it('matches the documented add example shape exactly', function () {
        var out = toDataHubPatchRecord({
            op: 'add',
            path: '/products/006',
            value: {
                attributes: { price: 299.99, rating: 4, reviews: 164 },
                variants: { '372991_0': { attributes: { sku: '120546', sku_price: 299.99 } } }
            }
        });
        assert.deepEqual(out, {
            op: 'add',
            path: '/006',
            value: {
                fields: { price: 299.99, rating: 4, reviews: 164 },
                variants: { '372991_0': { fields: { sku: '120546', sku_price: 299.99 } } }
            }
        });
    });

    it('converts the internal remove shape (data key) to a path-based remove', function () {
        var out = toDataHubPatchRecord({ op: 'remove', data: 'products/013' });
        assert.deepEqual(out, { op: 'remove', path: '/013' });
        assert.notProperty(out, 'data');
    });

    it('leaves an already-clean path untouched and omits value when absent', function () {
        var out = toDataHubPatchRecord({ op: 'remove', path: '/013/variants/013-LG' });
        assert.deepEqual(out, { op: 'remove', path: '/013/variants/013-LG' });
    });

    it('passes an unrelated key (e.g. views) through unchanged (unreachable under Data Hub guard)', function () {
        var out = toDataHubPatchRecord({
            op: 'add',
            path: '/products/006',
            value: { attributes: { title: 't' }, views: { usd: { attributes: { price: 1 } } } }
        });
        assert.property(out.value, 'fields');
        assert.deepEqual(out.value.views, { usd: { attributes: { price: 1 } } });
    });
});
