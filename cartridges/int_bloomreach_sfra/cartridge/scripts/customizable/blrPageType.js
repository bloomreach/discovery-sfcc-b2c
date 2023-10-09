'use strict';

/**
 * @description Maps site's page type classifications to the values Bloomreach expects for page type classifications (ptype).
 * @param {string} action Controller-Endpoint pair from pdict.action attribute
 * @returns {string} Bloomreach page type classification
 */

exports.getBlrPageType = function (action) {
    var pageType = '';

    switch (action) {
        case 'Home-Show':
            pageType = 'homepage';
            break;
        case 'Product-Show':
            pageType = 'product';
            break;
        case 'Page-Show':
            pageType = 'content';
            break;
        case 'Order-Confirm':
            pageType = 'conversion';
            break;
        case 'Search-Show':
            pageType = request.getHttpParameterMap().isParameterSubmitted('cgid')
            ? 'category'
            : 'search';
            break;
        default:
            pageType = 'other';
    }

    return pageType;
};
