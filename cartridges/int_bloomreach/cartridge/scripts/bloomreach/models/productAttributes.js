'use strict';

var Site = require('dw/system/Site');
var Currency = require('dw/util/Currency');
var CatalogMgr = require('dw/catalog/CatalogMgr');
var URLUtils = require('dw/web/URLUtils');
var StringUtils = require('dw/util/StringUtils');

/**
 * Function get value of product property by attribute full name.
 * An attribute name can be complex and consist of several levels.
 * Attribute names must be separated by dots.
 * Examle: primaryCategory.ID
 * @param {dw.catalog.Product} product - product
 * @param {string} productAttributeName - product attribute full name
 * @returns {string|boolean|number|null} - value
 */
function getAttributeValue(product, productAttributeName) {
    var properties = productAttributeName.split('.');
    var result = properties.reduce(function (previousValue, currentProperty) {
        return previousValue ? previousValue[currentProperty] : null;
    }, product);

    return result;
}

/**
 * Create category tree of Product
 * @param {dw.catalog.Category} category - category
 * @returns {Object} - category tree
 */
function getCategoryFlatTree(category) {
    if (empty(category)) return [];

    var categoryTree = [];
    var currentCategory = category;
    categoryTree.push({
        id: currentCategory.ID,
        name: getAttributeValue(currentCategory, 'displayName')
    });

    while (!currentCategory.topLevel && !currentCategory.root) {
        currentCategory = currentCategory.parent;
        categoryTree.push({
            id: currentCategory.ID,
            name: getAttributeValue(currentCategory, 'displayName')
        });
    }

    // Add root category to the top of the category tree
    if (!currentCategory.root) {
        var rootCategory = CatalogMgr.siteCatalog.root;
        categoryTree.push({
            id: rootCategory ? rootCategory.ID : 'root',
            name: rootCategory ? rootCategory.displayName : 'Root category'
        });
    }

    return categoryTree.reverse();
}

/**
 * Handler complex and calculated Product attributes
 */
var agregatedValueHanlders = {
    categories: function (product) {
        var productCategories = product.getOnlineCategories();
        productCategories = empty(productCategories) ? [] : productCategories.toArray();

        if (product.isVariant()) {
            var masterProductCategories = product.masterProduct.getOnlineCategories();
            masterProductCategories = empty(masterProductCategories) ? [] : masterProductCategories.toArray();
            productCategories = productCategories.concat(masterProductCategories);
        }

        return productCategories
            .map(function (category) {
                return getCategoryFlatTree(category);
            });
    },
    color: function (product) {
        var variationModel = product.getVariationModel();
        var colorAttribute = variationModel.getProductVariationAttribute('color');
        return (colorAttribute && variationModel.getSelectedValue(colorAttribute))
            ? variationModel.getSelectedValue(colorAttribute).displayValue
            : null;
    },
    size: function (product) {
        var variationModel = product.getVariationModel();
        var sizeAttribute = variationModel.getProductVariationAttribute('size');
        return (sizeAttribute && variationModel.getSelectedValue(sizeAttribute))
            ? variationModel.getSelectedValue(sizeAttribute).displayValue
            : null;
    },
    price: function (product) {
        var price = product.productSet ? product.priceModel.minPrice : product.priceModel.price;
        return price.available && price.value ? price.value : null;
    },
    url: function (product) {
        var productPageUrl = URLUtils.https('Product-Show', 'pid', product.ID);
        return productPageUrl ? productPageUrl.toString() : null;
    },
    thumb_image: function (product) {
        var imageItem = product.getImage('large'); // large thumbnail
        return imageItem ? StringUtils.trim(imageItem.absURL.toString()) : null;
    },
    title: function (product) {
        return product.name ? product.name.toLowerCase() : product.name;
    },
    description: function (product) {
        return product.longDescription ? product.longDescription.markup.toLowerCase() : null;
    }
};

/**
 * Decorator, add localized price to the Object
 * @param {Object} target - tatget Object
 * @param {dw.order.Product} product - SFCC Product
 */
function addMultiCurrencyPrice(target, product) {
    var that = target;
    var currentSession = request.getSession();
    var siteCurrencies = Site.getCurrent().getAllowedCurrencies();
    var siteCurrenciesSize = siteCurrencies.size();
    var currentCurrency = currentSession.getCurrency();

    for (var i = 0; i < siteCurrenciesSize; i += 1) {
        var currency = Currency.getCurrency(siteCurrencies[i]);
        currentSession.setCurrency(currency);
        var price = product.productSet ? product.priceModel.minPrice : product.priceModel.price;
        if (price.available) {
            that['price_' + price.currencyCode.toLowerCase()] = price.value;
        }
    }
    currentSession.setCurrency(currentCurrency);
}

/**
 * BloomreachProduct class that represents an Product Object of Bloomreach
 * @param {dw.order.Product} product - SFCC Product
 * @param {Object} productAttributes - config of Bloomreach Product Object
 * @param {boolean} isMultiCurrency - add multicurrency price
 * @constructor
 */
function ProductAttributes(product, productAttributes, isMultiCurrency) {
    var that = this;
    Object.keys(productAttributes).forEach(function (attr) {
        var attrVal = productAttributes[attr];
        if (attr === 'price' && isMultiCurrency) {
            addMultiCurrencyPrice(that, product);
        } else {
            var result = agregatedValueHanlders[attrVal]
                ? agregatedValueHanlders[attrVal](product)
                : getAttributeValue(product, attrVal);
            if (result !== null && result !== undefined) {
                that[attr] = result;
            }
        }
    });
}

module.exports = ProductAttributes;
