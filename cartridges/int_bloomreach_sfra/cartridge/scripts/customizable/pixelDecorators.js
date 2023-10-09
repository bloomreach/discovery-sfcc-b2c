'use strict';

/**
 * @memberof int_bloomreach
 * @category int_bloomreach
 * @subcategory hooks
 * @module pixelDecorators
 * @description Provide data for each pixel type. Can be customized to fit Merchant's needs
 */

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
            value: session.customer.ID,
            enumerable: true
        },
        tms: {
            value: 'TODO: Specify Tag Manager',
            enumerable: true
        }
    });
};

exports.productPage = function (pixelData, pdict) {
    Object.defineProperties(pixelData, {
        prod_id: {
            value: pdict.product.id,
            enumerable: true
        },
        prod_name: {
            value: pdict.product.productName,
            enumerable: true
        },
        sku: {
            value: 'TODO: Clarify the value',
            enumerable: true
        }
    });
};

exports.categoryPage = function (pixelData, pdict) {
    Object.defineProperties(pixelData, {
        cat_id: {
            value: request.getHttpParameterMap().get('cgid'),
            enumerable: true
        },
        cat: {
            value: 'TODO: Get from Catalog API',
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

/**
 * @description Get order product data
 * @param {Object} order - SFRA order model
 * @returns {Object} mapped items data
 */
function getOrderItems(order) {
    var itemsArray = order.items.items.map(
    item=>{
        return {
            prod_id: item.id,
            // sku: 'sku1234',
            name: item.productName,
            quantity: item.quantity,
            price: item.priceTotal.price,
            is_gift: item.isGift,
            is_bonus_product: item.isBonusProductLineItem
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
            value: order.orderNumber,
            enumerable: true
        },
        basket_value: {
            value: order.priceTotal,
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
