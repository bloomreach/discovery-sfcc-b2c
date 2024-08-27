'use strict';

/**
 * @memberof int_bloomreach
 * @category int_bloomreach
 * @subcategory hooks
 * @module pixelDecorators
 * @description Provide data for each pixel type. Can be customized to fit Merchant's needs
 */

/**
 * Get top level product ID
 * @param {dw.catalog.Product} product - produet
 * @returns {string} - product ID
 */
function getTopLevelProductId(product) {
    var id = product.ID;

    if (product.variant) {
        id = product.masterProduct.ID;
    }

    return id;
}

/**
 * Get breadcrumb of category tree
 * @param {string} categoryId -category ID
 * @returns {string} - breadcrumb of category tree delimited by pipe ( | character)
 */
function getCategoryBreadcrumb(categoryId) {
    var CatalogMgr = require('dw/catalog/CatalogMgr');
    var currentCat = categoryId;
    var breadcrumb = [];

    while (currentCat && currentCat !== 'root') {
        var category = CatalogMgr.getCategory(currentCat);
        breadcrumb.push(category.displayName);
        currentCat = category.parent.ID;
    }
    return breadcrumb.reverse().join('|');
}

/**
 * Get content name by name ID
 * @param {number} id - content ID
 * @returns {string} - content name
 */
function getContentName(id) {
    var ContentMgr = require('dw/content/ContentMgr');
    var PageMgr = require('dw/experience/PageMgr');

    var page = PageMgr.getPage(id);
    var name = '';

    if (page) {
        name = page.name;
    } else {
        var apiContent = ContentMgr.getContent(id);
        if (apiContent) {
            name = apiContent.name;
        }
    }

    return name;
}

/**
 * Get catalog names from http request
 * @returns {string} - Json string of catalog names array
 */
function getCatalogNames() {
    var cgid = request.getHttpParameterMap().get('cgid').stringValue;
    var result = [];
    if (cgid) {
        result = [{ name: cgid }];
    }
    return JSON.stringify(result);
}

exports.globalPage = function (pixelData, pdict) {
    var libBloomreach = require('*/cartridge/scripts/bloomreach/lib/libBloomreach');
    var blrPageType = require('~/cartridge/scripts/customizable/blrPageType');

    Object.defineProperties(pixelData, {
        ptype: {
            value: blrPageType.getBlrPageType(pdict.action),
            enumerable: true
        },
        locale: {
            value: pdict.locale,
            enumerable: true
        },
        action: {
            value: pdict.action,
            enumerable: true
        },
        title: {
            value: pdict.CurrentPageMetaData.title,
            enumerable: true
        },
        acct_id: {
            value: libBloomreach.getPreference('AccountID'),
            enumerable: true
        },
        domain_key: {
            value: libBloomreach.getPreference('DomainKey'),
            enumerable: true
        },
        view_id: {
            value: libBloomreach.getViewId(),
            enumerable: true
        },
        user_id: {
            value: libBloomreach.getUserId(),
            enumerable: true
        },
        tms: {
            value: 'TODO: Specify Tag Manager',
            enumerable: true
        }
    });
};

exports.productPage = function (pixelData, pdict) {
    var ProductMgr = require('dw/catalog/ProductMgr');
    var product = ProductMgr.getProduct(pdict.product.id);
    Object.defineProperties(pixelData, {
        prod_id: {
            value: getTopLevelProductId(product),
            enumerable: true
        },
        prod_name: {
            value: pdict.product.productName,
            enumerable: true
        },
        sku: {
            value: pdict.product.id,
            enumerable: true
        }
    });
};

exports.categoryPage = function (pixelData, pdict) {
    var catId = request.getHttpParameterMap().get('cgid');

    Object.defineProperties(pixelData, {
        cat_id: {
            value: request.getHttpParameterMap().get('cgid'),
            enumerable: true
        },
        cat: {
            value: getCategoryBreadcrumb(catId),
            enumerable: true
        }
    });
};

exports.searchPage = function (pixelData, pdict) {
    Object.defineProperty(pixelData, 'search_term', {
        value: request.getHttpParameterMap().get('q'),
        enumerable: true
    });
};

exports.searchContent = function (pixelData, pdict) {
    var cid = request.getHttpParameterMap().get('cid').stringValue;
    Object.defineProperty(pixelData, 'catalogs', {
        value: getCatalogNames(),
        enumerable: true
    });
    Object.defineProperty(pixelData, 'item_id', {
        value: cid,
        enumerable: true
    });
    Object.defineProperty(pixelData, 'item_name', {
        value: getContentName(cid),
        enumerable: true
    });
};

/**
 * @description Get order product data
 * @param {Object} order - SFRA order model
 * @returns {Object} mapped items data
 */
function getOrderItems(order) {
    var collections = require('*/cartridge/scripts/util/collections');
    var productLineItems = order.getProductLineItems();

    var itemsArray = collections.map(productLineItems, function (pli) {
        return {
            prod_id: getTopLevelProductId(pli.product),
            sku: pli.productID,
            name: pli.productName,
            quantity: pli.quantityValue,
            price: pli.basePrice.value,
            is_gift: pli.gift,
            is_bonus_product: pli.bonusProductLineItem
        };
    });

    return {
        items: itemsArray
    };
}

/**
 * @description Get order product data
 * @param {Object} pixelData - Bloomreach pixel data
 * @param {Object} order - SFRA Order model
 */
exports.confirmationPage = function (pixelData, order) {
    Object.defineProperties(pixelData, {
        is_conversion: {
            value: 1,
            enumerable: true
        },
        order_id: {
            value: order.orderNo,
            enumerable: true
        },
        basket_value: {
            value: order.totalGrossPrice.value,
            enumerable: true
        },
        basket: {
            value: JSON.stringify(getOrderItems(order)),
            enumerable: true
        },
        currency: {
            value: session.currency.currencyCode,
            enumerable: true
        }
    });
};
