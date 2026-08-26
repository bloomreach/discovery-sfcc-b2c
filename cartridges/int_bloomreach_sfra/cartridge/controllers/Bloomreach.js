'use strict';

var server = require('server');

/**
 * Get widget properties from querystring
 * @param {Object} params - http querystring
 * @returns {Object} widget properties
 */
function getWidgetParams(params) {
    const eligibleParams = [
        // 'account_id',
        // 'domain_key',
        // '_br_uid_2',
        'wty',
        'widget_id',
        'cat_id',
        'item_ids',
        'context_id',
        'query',
        'request_id',
        'url',
        'facet',
        'fields',
        'filter',
        'filter_facet',
        'ref_url',
        'rows',
        'start',
        'user_id',
        'view_id'
    ];
    var result = {};

    Object.keys(params).forEach(function (key) {
        if (eligibleParams.indexOf(key) > -1) {
            result[key] = params[key];
        }
    });

    return result;
}

server.get('Widget', function (req, res, next) {
    var widget = getWidgetParams(req.querystring);

    res.render('bloomreach/recommends', {
        widget: widget
    });

    return next();
});

server.get('Recommendations', function (req, res, next) {
    const libBloomreach = require('*/cartridge/scripts/bloomreach/lib/libBloomreach');
    const bloomreachServiceHelper = require('*/cartridge/scripts/services/blrServiceHelper');

    var recommendationParams = getWidgetParams(req.querystring);
    recommendationParams.request_id = request.requestID;
    recommendationParams.url = request.httpURL.toString();
    recommendationParams.ref_url = request.httpReferer || '';

    // Add Uid of first-party cookie
    var cookieAccepted = request.getHttpCookies()['_br_uid_2'];
    var cookieValue = cookieAccepted ? cookieAccepted.getValue() : null;
    if (cookieValue) {
        recommendationParams['_br_uid_2'] = cookieValue;
    }

    if (libBloomreach.getPreference('MiltiCurrency').value === 'priceAsView') {
        recommendationParams.view_id = libBloomreach.getViewId();
    }

    var apiRecommendations = bloomreachServiceHelper.getRecommendations(recommendationParams);

    var recommendations = {
        productIds: [],
        widget: getWidgetParams(req.querystring)
    };

    if (apiRecommendations.ok) {
        var resultObj = apiRecommendations.object;
        recommendations.productIds = resultObj.response.docs;
        recommendations.widget.wrid = resultObj.metadata.widget.rid;
    }

    res.render('bloomreach/recommendProducts', {
        recommendations: recommendations
    });

    return next();
});

module.exports = server.exports();
