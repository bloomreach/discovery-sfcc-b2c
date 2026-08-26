'use strict';

/**
 * Transforms the connector's internal Bloomreach product record shape
 * (produced by models/product.js) into the shape expected by the Bloomreach
 * Data Hub Item Collections API.
 *
 * Only two structural details differ from the internal model; everything else
 * (attribute names/values, variant keying, op type) is preserved verbatim:
 *   1. Path      : "/products/{id}"  ->  "/{id}"   (no "/products/" prefix)
 *   2. Field key : value.attributes  ->  value.fields   (product AND variant level)
 *
 * The internal model also emits deletions as { op: 'remove', data: 'products/{id}' }
 * (see blrProductExport.getLocalizedRemoveProduct). Data Hub expects removals to
 * use `path` like every other op, so that is normalized here as well.
 *
 * NOTE: a `value.views[currency]` branch (multi-currency "priceAsView") would be
 * passed through unchanged, but this path is unreachable under Data Hub mode - the
 * priceAsView guard in blrProductExport.js's beforeStep() fails the job before any
 * record reaches this transform. Data Hub Item Collections has no views concept.
 */

/**
 * Normalize a record path/data value to a Data Hub path.
 * Accepts "/products/006", "products/006", "/006", "006", or nested
 * "products/006/variants/x" and returns a leading-slash path with the
 * "products/" collection prefix removed.
 * @param {string} rawPath - path or data value from the internal record
 * @returns {string} - Data Hub path (e.g. "/006")
 */
function normalizePath(rawPath) {
    if (!rawPath) { return rawPath; }
    // strip a single leading slash, drop the "products/" prefix, re-add slash
    var withoutLeadingSlash = rawPath.charAt(0) === '/' ? rawPath.slice(1) : rawPath;
    var withoutPrefix = withoutLeadingSlash.replace(/^products\//, '');
    return '/' + withoutPrefix;
}

/**
 * Recursively rename `attributes` -> `fields` at the product level and inside
 * each variant. Any other key (e.g. `views`) is copied through unchanged.
 * @param {Object} value - the record's `value` object
 * @returns {Object} - value with attributes renamed to fields
 */
function renameAttributesToFields(value) {
    if (value === null || typeof value !== 'object') { return value; }

    var result = {};
    Object.keys(value).forEach(function (key) {
        if (key === 'attributes') {
            result.fields = value.attributes;
        } else if (key === 'variants' && value.variants && typeof value.variants === 'object') {
            result.variants = {};
            Object.keys(value.variants).forEach(function (variantId) {
                result.variants[variantId] = renameAttributesToFields(value.variants[variantId]);
            });
        } else {
            result[key] = value[key];
        }
    });
    return result;
}

/**
 * Convert one internal Bloomreach product record into a Data Hub patch record.
 * Pure function - no SFCC API dependencies - so it is independently testable.
 * @param {Object} record - internal record { op, path|data, value? }
 * @returns {Object} - Data Hub record { op, path, value? }
 */
function toDataHubPatchRecord(record) {
    if (!record || typeof record !== 'object') { return record; }

    var rawPath = record.path;
    if (!rawPath && record.data) {
        // internal `remove` shape uses `data: 'products/{id}'`
        rawPath = record.data;
    }

    var result = {
        op: record.op,
        path: normalizePath(rawPath)
    };

    if (Object.prototype.hasOwnProperty.call(record, 'value')) {
        result.value = renameAttributesToFields(record.value);
    }

    return result;
}

/**
 * Transform a JSONLines feed file (internal shape, one record per line) into a
 * new JSONLines file in Data Hub shape. Blank lines are skipped; a malformed
 * line throws so the delivery job fails loudly rather than shipping bad data.
 * @param {dw.io.File} srcFile - source feed file (internal shape)
 * @param {dw.io.File} destFile - destination file to write (Data Hub shape)
 * @returns {number} - number of records written
 */
function transformFeedFile(srcFile, destFile) {
    var FileReader = require('dw/io/FileReader');
    var FileWriter = require('dw/io/FileWriter');

    var reader = new FileReader(srcFile);
    var writer = new FileWriter(destFile);
    writer.setLineSeparator('\n');

    var count = 0;
    try {
        var line = reader.readLine();
        while (line !== null) {
            if (line.length > 0) {
                var record = JSON.parse(line);
                writer.writeLine(JSON.stringify(toDataHubPatchRecord(record)));
                count++;
            }
            line = reader.readLine();
        }
    } finally {
        writer.close();
        reader.close();
    }
    return count;
}

module.exports = {
    toDataHubPatchRecord: toDataHubPatchRecord,
    transformFeedFile: transformFeedFile,
    normalizePath: normalizePath
};
