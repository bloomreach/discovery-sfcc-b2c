'use strict';

var ProductAttributes = require('*/cartridge/scripts/bloomreach/models/productAttributes');
var miltiCurrencyType = require('*/cartridge/scripts/bloomreach/lib/libBloomreach').getPreference('MiltiCurrency');

/**
 * Order class that represents the Bloomreach Product
 * @param {dw.catalog.Product} product - product
 * @param {string} operation - Bloomreach operation type
 * @param {Object} productAttributes - list of Bloomreach product attributes
 * @constructor
 */
function ProductModel(product, operation, productAttributes) {
    const MULTY_CURRENCY_ATTR = miltiCurrencyType.value === 'priceAsAttr';
    const MULTY_CURRENCY_VIEW = miltiCurrencyType.value === 'priceAsView';

    this.op = operation;
    if (empty(product) || empty(productAttributes)) {
        this.path = null;
    } else {
        this.path = '/products/' + product.ID;
        this.value = {};

        // Master product attributes
        var mpAttr = new ProductAttributes(product, productAttributes, MULTY_CURRENCY_ATTR, null);
        this.value.attributes = mpAttr;
        // Variant product attributes
        var variants = product.getVariants();
        if (variants.length !== 0) {
            var variantsIter = variants.iterator();
            this.value.variants = {};
            while (variantsIter.hasNext()) {
                var variantProduct = variantsIter.next();
                var variantProductId = variantProduct.ID;
                var vpAttr = new ProductAttributes(variantProduct, productAttributes, MULTY_CURRENCY_ATTR, mpAttr);
                this.value.variants[variantProductId] = {
                    attributes: vpAttr
                };
            }
        } else {
            this.value.variants = {};
            this.value.variants[product.ID] = {
                attributes: {}
            };
        }
        // Add product multicurrency as View
        if (MULTY_CURRENCY_VIEW) {
            var multicurrencyView = require('*/cartridge/scripts/bloomreach/models/decorators/multicurrencyView');
            multicurrencyView(this.value, product);
        }
    }
}

module.exports = ProductModel;
