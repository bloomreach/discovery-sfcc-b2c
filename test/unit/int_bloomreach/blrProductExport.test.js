'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru();
var path = require('path');

var scriptPath = path.join(
    process.cwd(),
    'cartridges/int_bloomreach/cartridge/scripts/jobs/blrProductExport.js'
);

// ---- dw stubs ---------------------------------------------------------------

var noopLogger = { info: function () {}, warn: function () {}, error: function () {} };

// Records every FileWriter created during beforeStep so a test can inspect what
// was written to each locale's file.
var writers;

/**
 * Minimal dw.io.File stub. Two-arg form (dir, name) is used for feed/snapshot
 * files; one-arg form for the feed directory.
 * @param {*} a - path string or parent dir
 * @param {string} [b] - file name when a is a parent dir
 */
function FileStub(a, b) {
    this.name = (typeof b === 'string') ? b : String(a);
}
FileStub.TEMP = '/tmp';
FileStub.SEPARATOR = '/';
FileStub.prototype.mkdirs = function () { return true; };
FileStub.prototype.listFiles = function () { return []; };
FileStub.prototype.exists = function () { return false; };
FileStub.prototype.length = function () { return 0; };
FileStub.prototype.remove = function () { return true; };

/**
 * Minimal dw.io.FileWriter stub that captures written lines.
 * @param {Object} file - the FileStub it writes to
 */
function FileWriterStub(file) {
    this.file = file;
    this.lines = [];
    writers.push(this);
}
FileWriterStub.prototype.setLineSeparator = function () {};
FileWriterStub.prototype.writeLine = function (line) { this.lines.push(line); };
FileWriterStub.prototype.close = function () {};

/**
 * Build a getAllowedLocales()-style collection (array with a .size() method).
 * @param {Array<string>} arr - locale names
 * @returns {Array<string>} - list with size()
 */
function localeList(arr) {
    var list = arr.slice();
    list.size = function () { return arr.length; };
    return list;
}

/**
 * Load blrProductExport with all dw / cartridge deps stubbed for the given
 * locale set and delivery-mode preference.
 * @param {Array<string>} locales - allowed site locales
 * @param {Object} [prefs] - getPreference overrides keyed by preference id
 * @returns {Object} - the module exports
 */
function loadModule(locales, prefs) {
    var preferences = prefs || {};
    var defaults = {
        MiltiLocaleEnabled: true,
        ProductFeedDeliveryMode: 'CatalogManagementAPI',
        MiltiCurrency: null,
        ProductFields: '{}'
    };

    global.request = {
        getLocale: function () { return locales[0]; },
        setLocale: function () {}
    };

    return proxyquire(scriptPath, {
        'dw/util/Calendar': function () {},
        'dw/util/StringUtils': { formatCalendar: function () { return '20200101000000'; } },
        'dw/system/Site': {
            getCurrent: function () { return { getAllowedLocales: function () { return localeList(locales); } }; },
            current: { ID: 'RefArch' }
        },
        'dw/io/File': FileStub,
        'dw/io/FileWriter': FileWriterStub,
        'dw/io/FileReader': function () {},
        'dw/system/Logger': { getLogger: function () { return noopLogger; } },
        'dw/catalog/ProductMgr': {
            queryAllSiteProductsSorted: function () {
                return { hasNext: function () { return false; }, close: function () {} };
            }
        },
        '*/cartridge/scripts/bloomreach/lib/constants': {
            PRODUCT_FEED_LOCAL_PATH: 'bloomreach/product',
            PRODUCT_FEED_PREFIX: 'product_feed',
            PRODUCT_SNAPSHOT_PREFIX: 'product_snapshot_'
        },
        '*/cartridge/scripts/bloomreach/lib/libBloomreach': {
            getPreference: function (id) {
                return Object.prototype.hasOwnProperty.call(preferences, id)
                    ? preferences[id]
                    : defaults[id];
            },
            getProductAttributes: function () { return {}; }
        },
        '*/cartridge/scripts/bloomreach/models/product': function () {}
    });
}

/**
 * Find the capturing FileWriter for a given locale's feed file.
 * @param {string} locale - locale name embedded in the feed file name
 * @returns {Object} - the FileWriterStub for that locale
 */
function writerForLocale(locale) {
    return writers.filter(function (w) {
        return w.file && w.file.name && w.file.name.indexOf('_' + locale + '.jsonl') !== -1;
    })[0];
}

describe('blrProductExport.write - multi-locale delta', function () {
    beforeEach(function () { writers = []; });

    it('writes a line only for locales present in the delta payload, not undefined for untouched locales', function () {
        var mod = loadModule(['en_US', 'fr_FR']);
        mod.beforeStep({ Enabled: true, FeedType: 'DeltaFeed' });

        // Product changed in en_US only: the delta payload has an en_US entry but
        // no fr_FR key (fr_FR was untouched by this edit).
        mod.write([{ product: { id: 'p1', en_US: '{"id":"p1","op":"add"}' } }]);

        var enWriter = writerForLocale('en_US');
        var frWriter = writerForLocale('fr_FR');

        assert.isDefined(enWriter, 'en_US feed writer should exist');
        assert.isDefined(frWriter, 'fr_FR feed writer should exist');

        // Changed locale gets exactly its line.
        assert.deepEqual(enWriter.lines, ['{"id":"p1","op":"add"}']);

        // Untouched locale must get NO line (previously wrote undefined -> a
        // malformed line that dataHubTransform rejects on JSON.parse).
        assert.equal(frWriter.lines.length, 0);
        assert.notInclude(frWriter.lines, undefined);
    });

    it('writes to every locale when the payload carries all locales (add/full case)', function () {
        var mod = loadModule(['en_US', 'fr_FR']);
        mod.beforeStep({ Enabled: true, FeedType: 'DeltaFeed' });

        mod.write([{ product: { id: 'p2', en_US: '{"id":"p2"}', fr_FR: '{"id":"p2","fr":true}' } }]);

        assert.deepEqual(writerForLocale('en_US').lines, ['{"id":"p2"}']);
        assert.deepEqual(writerForLocale('fr_FR').lines, ['{"id":"p2","fr":true}']);
    });
});

describe('blrProductExport.beforeStep - Data Hub config validation', function () {
    beforeEach(function () { writers = []; });

    var populated = {
        ProductFeedDeliveryMode: 'DataHub',
        MiltiCurrency: null,
        DataHubBaseUrl: 'https://api.bloomreach.com',
        DataHubWorkspaceId: 'ws-1',
        DataHubApiTokenName: 'token',
        DataHubApiTokenSecret: 'secret'
    };

    it('throws naming every missing preference when all four are empty', function () {
        var mod = loadModule(['en_US'], {
            ProductFeedDeliveryMode: 'DataHub',
            MiltiCurrency: null,
            DataHubBaseUrl: '',
            DataHubWorkspaceId: '',
            DataHubApiTokenName: '',
            DataHubApiTokenSecret: ''
        });
        assert.throws(function () {
            mod.beforeStep({ Enabled: true, FeedType: 'FullFeed' });
        }, /blr_DataHubBaseUrl.*blr_DataHubWorkspaceId.*blr_DataHubApiTokenName.*blr_DataHubApiTokenSecret/);
    });

    it('names only the missing preference when others are populated', function () {
        var prefs = Object.assign({}, populated, { DataHubWorkspaceId: '   ' });
        var mod = loadModule(['en_US'], prefs);
        var err;
        try {
            mod.beforeStep({ Enabled: true, FeedType: 'FullFeed' });
        } catch (e) { err = e; }
        assert.isDefined(err);
        assert.include(err.message, 'blr_DataHubWorkspaceId');
        assert.notInclude(err.message, 'blr_DataHubBaseUrl');
        assert.notInclude(err.message, 'blr_DataHubApiTokenName');
    });

    it('does not throw when Data Hub mode is fully configured', function () {
        var mod = loadModule(['en_US'], populated);
        assert.doesNotThrow(function () {
            mod.beforeStep({ Enabled: true, FeedType: 'FullFeed' });
        });
    });

    it('does not validate Data Hub prefs when delivery mode is not Data Hub', function () {
        var mod = loadModule(['en_US'], { ProductFeedDeliveryMode: 'CatalogManagementAPI', MiltiCurrency: null });
        assert.doesNotThrow(function () {
            mod.beforeStep({ Enabled: true, FeedType: 'FullFeed' });
        });
    });
});
