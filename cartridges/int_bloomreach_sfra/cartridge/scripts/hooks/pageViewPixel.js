'use strict';

/**
 * @memberof int_bloomreach
 * @category int_bloomreach
 * @subcategory hooks
 * @module globalPixel
 * @description Hooks to work with Bloomreach Global Pixels
 */

/**
 * @description Returns Bloomreach enablement status
 * @returns {boolean} is Bloomreach enabled or not
 */
function isBLREnabled() {
    var currentSite = require('dw/system/Site').getCurrent();

    return true; // currentSite.getCustomPreferenceValue('bloomreachEnabled');
}

/**
 * @description Check if Commerce Cloud Instance Type is production
 * @returns {boolean} is production environment
 */
function isNonProdEnvironment() {
    var System = require('dw/system/System');
    return System.getInstanceType() !== System.PRODUCTION_SYSTEM;
}

/**
 * @description Renders Global Pixel Snippet and data into current template
 * @param {Object} pdict view data object
 */
exports.afterFooter = function (pdict) {
    if (isBLREnabled()) {
        var ISML = require('dw/template/ISML');
        var pixelDecorator = require('~/cartridge/scripts/customizable/pixelDecorators');
        var pixelData = Object.create(null);
        var template = 'pixels/pixelData';

        if (isNonProdEnvironment()) {
            pixelData.test_data = true;
        }

        pixelDecorator.globalPage(pixelData, pdict); // this should be first as other decorators may rely on global data

        switch (pixelData.ptype) { // pageType
            case 'product':
                pixelDecorator.productPage(pixelData, pdict);
                break;
            case 'category':
                pixelDecorator.categoryPage(pixelData, pdict);
                break;
            case 'search':
                pixelDecorator.searchPage(pixelData, pdict);
                break;
            case 'content':
                pixelDecorator.searchContent(pixelData, pdict);
                break;
            case 'conversion':
                var OrderMgr = require('dw/order/OrderMgr');
                var pm = request.getHttpParameterMap();
                var orderID = pm.get('orderID').getValue();
                var orderToken = pm.get('orderToken').getValue();
                var order = OrderMgr.getOrder(orderID, orderToken);
                pixelDecorator.confirmationPage(pixelData, order); // this is SFRA Order model, not SfCC native
                template = 'pixels/confirmationData';
                break;
            default:
        }

        ISML.renderTemplate(template, {
            pixelData: pixelData
        });
    }
};

