'use strict';

const preferences = require('*/cartridge/config/preferences');
const libBloomreach = require('*/cartridge/scripts/bloomreach/lib/libBloomreach');

const DEFAULT_PAGE_SIZE = preferences.defaultPageSize ? preferences.defaultPageSize : 12;

/**
 * Updates the search model with the preference refinement values
 *
 * @param {dw.catalog.SearchModel} searchModel - SearchModel instance
 * @param {Object} pref - Query params map
 */
function addRefinementValues(searchModel, pref) {
    Object.keys(pref).forEach(function (key) {
        if (key !== 'sortrule' && key !== 'sortval') {
            searchModel.addRefinementValues(key, pref[key]);
        }
    });
}

/**
 * Configures and returns a PagingModel instance
 *
 * @param {dw.util.Iterator} productHits - Iterator for product search results
 * @param {number} count - Number of products in search results
 * @param {number} pageSize - Number of products to display
 * @param {number} startIndex - Beginning index value
 * @return {dw.web.PagingModel} - PagingModel instance
 */
function getPagingModel(productHits, count, pageSize, startIndex) {
    var PagingModel = require('dw/web/PagingModel');
    var paging = new PagingModel(productHits, count);

    paging.setStart(startIndex || 0);
    paging.setPageSize(pageSize || DEFAULT_PAGE_SIZE);

    return paging;
}

/**
 * Generates URL for [Show] More button
 *
 * @param {number} hitsCount - Product search count
 * @param {Object} httpParams - HTTP query parameters
 * @return {string} - More button URL
 */
function getShowMoreUrl(hitsCount, httpParams) {
    var showMoreEndpoint = 'Search-UpdateGrid';
    var currentStart = httpParams.start || 0;
    var pageSize = httpParams.sz || DEFAULT_PAGE_SIZE;
    var nextStart;
    var ProductSearchModel = require('dw/catalog/ProductSearchModel');
    var searchModel = new ProductSearchModel();
    var searchQuery = libBloomreach.formatSearchPhrase(httpParams.q);
    if (searchQuery) {
        searchModel.setSearchPhrase(searchQuery);
    }
    if (httpParams.cgid) {
        searchModel.setCategoryID(httpParams.cgid);
    }

    if (httpParams.pid) {
        searchModel.setProductIDs([httpParams.pid]);
    }
    if (httpParams.pmin && !isNaN(+httpParams.pmin)) {
        searchModel.setPriceMin(+httpParams.pmin);
    }
    if (httpParams.pmax && !isNaN(+httpParams.pmax)) {
        searchModel.setPriceMax(+httpParams.pmax);
    }

    if (httpParams.pmid) {
        searchModel.setPromotionID(httpParams.pmid);
    }

    if (httpParams.preference) {
        addRefinementValues(searchModel, httpParams.preference);
    }

    if (httpParams.sortval && httpParams.sortrule) {
        searchModel.addRefinementValues('sortval', httpParams.sortval);
        searchModel.addRefinementValues('sortrule', httpParams.sortrule);
    }

    var productHits = searchModel.productSearchHits;

    var paging = getPagingModel(
        productHits,
        hitsCount,
        DEFAULT_PAGE_SIZE,
        currentStart
    );

    if (pageSize >= hitsCount) {
        return '';
    } else if (pageSize > DEFAULT_PAGE_SIZE) {
        nextStart = pageSize;
    } else {
        var endIdx = paging.getEnd();
        nextStart = endIdx + 1 < hitsCount ? endIdx + 1 : null;

        if (!nextStart) {
            return '';
        }
    }

    paging.setStart(nextStart);
    var baseUrl = searchModel.url(showMoreEndpoint);

    return {
        pageSize: pageSize,
        pageNumber: paging.currentPage,
        finalUrl: paging.appendPaging(baseUrl)
    };
}

module.exports = function (object, httpParams) {
    var showMoreUrl = getShowMoreUrl(object.count || 0, httpParams);

    Object.defineProperty(object, 'pageSize', {
        enumerable: true,
        value: showMoreUrl.pageSize
    });

    Object.defineProperty(object, 'pageNumber', {
        enumerable: true,
        value: showMoreUrl.pageNumber
    });

    Object.defineProperty(object, 'showMoreUrl', {
        enumerable: true,
        value: showMoreUrl.finalUrl
    });
};
