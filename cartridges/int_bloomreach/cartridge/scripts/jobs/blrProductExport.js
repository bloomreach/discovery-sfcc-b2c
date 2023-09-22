'use strict';

// API Objects
var Calendar = require('dw/util/Calendar');
var StringUtils = require('dw/util/StringUtils');
var Site = require('dw/system/Site');
var File = require('dw/io/File');
var FileWriter = require('dw/io/FileWriter');
var FileReader = require('dw/io/FileReader');
var Logger = require('dw/system/Logger').getLogger('Bloomreach', 'blrProductExport.js');
var ProductMgr = require('dw/catalog/ProductMgr');

var currentSites;
var siteLocales;
var siteLocalesSize;
var currentLocale;
var productsIter;
var config;
var fileStorage = [];
var snapshotFileWriter;
var snapshotFileReader = null;
var productSnapshot;
var newProductModel;

/**
 * Validate a product - it's a simple product
 * @param {dw.catalog.Product} product - Demandware product object
 * @returns {boolean} returns status of validation
 */
function isSimpleProduct(product) {
    // Do not include Master product
    if (product.master) return false;
    // Do not include Variation Group products
    if (product.variationGroup) return false;
    // Do not include Variant products
    if (product.variant) return false;
    // Do not include Set products
    if (product.productSet) return false;
    // Do not include Option products
    // if (product.optionProduct) return false;
    // Do not include Bundle product
    if (product.bundle) return false;
    return true;
}

/**
 * Read Bloomreach product objects from file
 * @param {dw.io.FileReader} fileReader - File Reader
 * @returns {Object} - Localized Bloomreach product objects
 */
function getNextSnapshotProduct(fileReader) {
    if (!fileReader) { return null; }
    var line = fileReader.readLine();
    var result = line ? JSON.parse(line) : null;
    return result;
}

/**
 * Read Bloomreach product objects from product SeekableIterator
 * @param {dw.util.SeekableIterator} iter - product SeekableIterator
 * @returns {Object} - Localized Bloomreach product objects
 */
function getNextLocalizedProductModel(iter) {
    var BloomreachProduct = require('*/cartridge/scripts/bloomreach/models/product');

    while (iter.hasNext()) {
        var product = iter.next();
        if (product.master || isSimpleProduct(product)) {
            currentSites = Site.getCurrent();
            currentLocale = request.getLocale();
            siteLocales = currentSites.getAllowedLocales();
            siteLocalesSize = siteLocales.size();

            var result = { id: product.ID };

            for (var i = 0; i < siteLocalesSize; i++) {
                var locale = siteLocales[i];
                request.setLocale(locale);
                var blrProduct = new BloomreachProduct(product, 'add', config);
                if (blrProduct.path) {
                    result[locale] = JSON.stringify(blrProduct);
                }
            }

            request.setLocale(currentLocale);
            return result;
        }
    }
    return null;
}

/**
 * Get Localized Bloomreach object for remove product from feed
 * @param {string} id - product ID
 * @returns {Object} - Localized Bloomreach product objects
 */
function getLocalizedRemoveProduct(id) {
    currentLocale = request.getLocale();
    siteLocales = currentSites.getAllowedLocales();
    siteLocalesSize = siteLocales.size();
    var result = {
        id: id
    };

    var rmData = JSON.stringify({
        op: 'remove',
        data: 'products/' + id
    });

    for (var i = 0; i < siteLocalesSize; i++) {
        result[siteLocales[i]] = rmData;
    }
    return result;
}

/**
 * Initialization step
 * @param {Object} parameters config parameters for job
 */
function beforeStep(parameters) {
    var enabled = parameters.Enabled;
    if (!enabled) {
        Logger.info('Product Feed Enable Parameter is not true!');
        return;
    }
    var { PRODUCT_FEED_LOCAL_PATH,
        PRODUCT_FEED_PREFIX,
        PRODUCT_SNAPSHOT_PREFIX } = require('*/cartridge/scripts/bloomreach/lib/constants');
    var isMultiLocale = require('*/cartridge/scripts/bloomreach/lib/libBloomreach').getPreference('MiltiLocaleEnabled');
    config = require('*/cartridge/scripts/bloomreach/lib/libBloomreach').getProductAttributes();

    currentSites = Site.getCurrent();
    currentLocale = request.getLocale();

    if (isMultiLocale) {
        siteLocales = currentSites.getAllowedLocales();
        siteLocalesSize = siteLocales.size();
    } else {
        siteLocales = [currentLocale];
        siteLocalesSize = siteLocales.length;
    }

    productsIter = ProductMgr.queryAllSiteProductsSorted();

    try {
        // create folder at the local storage
        var filepath = [File.TEMP, PRODUCT_FEED_LOCAL_PATH].join(File.SEPARATOR);
        var filepathFile = new File(filepath);
        filepathFile.mkdirs();

        // remove old product feed files
        var fileregex = new RegExp('^' + PRODUCT_FEED_PREFIX + '_' + Site.current.ID + '_\\d{14}.*?\\.jsonl$');
        filepathFile.listFiles(function (f) {
            if (fileregex.test(f.name)) {
                f.remove();
            }
            return false;
        });

        // create file for each locale
        var cal = new Calendar();
        var stamp = StringUtils.formatCalendar(cal, 'yyyyMMddhhmmss');
        var sid = Site.current.ID;

        for (var i = 0; i < siteLocalesSize; i++) {
            var localeName = siteLocales[i];
            var filename = PRODUCT_FEED_PREFIX + '_' + sid + '_' + stamp + '_' + localeName + '.jsonl';
            var file = new File(filepathFile, filename);
            var localData = {
                localeName: localeName,
                filename: filename,
                file: file,
                fileWriter: new FileWriter(file)
            };
            localData.fileWriter.setLineSeparator('\n');
            fileStorage.push(localData);
        }

        // Create new temporary snapshot file for writing
        var snapshotFileName = PRODUCT_SNAPSHOT_PREFIX + sid + '.tmp';
        var newSnapshotFile = new File(filepathFile, snapshotFileName);
        snapshotFileWriter = new FileWriter(newSnapshotFile, 'UTF-8');

        // Open existing snapshot file for reading
        snapshotFileName = PRODUCT_SNAPSHOT_PREFIX + sid + '.jsonl';
        var snapshotFile = new File(filepathFile, snapshotFileName);
        if (snapshotFile.exists()) {
            if (parameters.FeedType === 'FullFeed') {
                snapshotFile.remove();
            } else {
                snapshotFileReader = new FileReader(snapshotFile);
                productSnapshot = getNextSnapshotProduct(snapshotFileReader);
            }
        }
        newProductModel = getNextLocalizedProductModel(productsIter);
    } catch (error) {
        Logger.error('Can\'t create Product Feed file!');
        throw new Error('Can\'t create Product Feed file!');
    }
}

/**
 * Get Product from catalog
 * @param {Object} parameters config parameters for job
 * @returns {Object} order object
 */
function read(parameters) {
    if (parameters.Enabled) {
        while (newProductModel || productSnapshot) {
            var productForUpdate = null;

            // Add product to Bloomreach
            if (newProductModel && !productSnapshot) {
                productForUpdate = {
                    snapshot: newProductModel,
                    product: newProductModel
                };
                newProductModel = getNextLocalizedProductModel(productsIter);
            }

            // Remove product from Bloomreach
            if (!newProductModel && productSnapshot) {
                productForUpdate = {
                    product: getLocalizedRemoveProduct(productSnapshot.id)
                };
                productSnapshot = getNextSnapshotProduct(snapshotFileReader);
            }

            if (newProductModel && productSnapshot) {
                if (newProductModel.id === productSnapshot.id) {
                    productForUpdate = {
                        snapshot: newProductModel
                    };
                    // Update product to Bloomreach
                    Object.keys(newProductModel).forEach(function (key) { // eslint-disable-line no-loop-func
                        if (key !== 'id') {
                            if (newProductModel[key] !== productSnapshot[key]) {
                                if (!productForUpdate.product) {
                                    productForUpdate.product = {
                                        id: newProductModel.id
                                    };
                                }
                                productForUpdate.product[key] = newProductModel[key];
                            }
                        }
                    });

                    productSnapshot = getNextSnapshotProduct(snapshotFileReader);
                    newProductModel = getNextLocalizedProductModel(productsIter);
                } else if (newProductModel.id < productSnapshot.id) {
                    // Add product to Bloomreach
                    productForUpdate = {
                        snapshot: newProductModel,
                        product: newProductModel
                    };
                    newProductModel = getNextLocalizedProductModel(productsIter);
                } else {
                    // Remove product from Bloomreach
                    productForUpdate = {
                        product: getLocalizedRemoveProduct(productSnapshot.id)
                    };
                    productSnapshot = getNextSnapshotProduct(snapshotFileReader);
                }
            }

            return productForUpdate;
        }
    }
    return null;
}

/**
 * process product object
 * @param {Object} item - product item
 * @returns {Object} item object
 */
function process(item) {
    return item;
}

/**
 * Write products object to the file
 * @param {Object} items - products to be written to job
 */
function write(items) {
    for (var i = 0; i < items.length; i++) {
        var obj = items[i];
        var line = '';

        // Write product to snapshot file
        if (obj.snapshot) {
            line = JSON.stringify(obj.snapshot);
            snapshotFileWriter.writeLine(line);
        }

        // Write to localized Bloomreach files
        if (obj.product) {
            fileStorage.forEach(function (item) { // eslint-disable-line no-loop-func
                line = obj.product[item.localeName];
                item.fileWriter.writeLine(line);
            });
        }
    }
}

/**
 * cleanup and close file
 * @param {boolean} success - success job status
 * @param {Object} parameters config parameters for job
 */
function afterStep(success, parameters) {
    if (parameters.Enabled) {
        request.setLocale(currentLocale);

        fileStorage.forEach(function (item) {
            item.fileWriter.close();
            if (item.file.length() === 0) {
                item.file.remove();
            }
        });

        snapshotFileWriter.close();

        if (snapshotFileReader) {
            snapshotFileReader.close();
        }

        productsIter.close();
    }
}

module.exports = {
    beforeStep: beforeStep,
    read: read,
    process: process,
    write: write,
    afterStep: afterStep
};
