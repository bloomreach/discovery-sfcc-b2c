'use strict';

const CatalogMgr = require('dw/catalog/CatalogMgr');
const URLUtils = require('dw/web/URLUtils');
const libBloomreach = require('*/cartridge/scripts/bloomreach/lib/libBloomreach');

const decorators = {
    sorting: require('*/cartridge/models/bloomreach/decorators/productSort'),
    refinements: require('*/cartridge/models/bloomreach/decorators/refinements'),
    showMoreUrl: require('*/cartridge/models/bloomreach/decorators/showMoreUrl')
};

/**
 * Bloomreach Search Result model
 *
 * @param {Object} searchResult - search result
 * @param {string} categoryId - category id for Category search
 * @param {Object} params - current URL search parameters
 * @constructor
 */
function SearchResult(searchResult, categoryId, params) {
    // Initial empty search result
    this.searchKeywords = '';
    this.count = 0;
    this.isCategorySearch = false;
    this.productIds = [];
    this.autoCorrectQuery = '';
    this.query = '';
    this.searchKeywords = '';
    this.refinements = [];
    this.productSort = [];

    if (!searchResult.ok) { return; }

    var resultObj = searchResult.object.response;
    this.count = resultObj.numFound;

    // Add category
    this.isCategorySearch = !!categoryId;
    if (categoryId) {
        var category = CatalogMgr.getCategory(categoryId);
        this.category = {
            id: category.ID,
            name: category.displayName,
            pageDescription: category.pageDescription,
            pageKeywords: category.pageKeywords,
            pageTitle: category.pageTitle,
            parentId: category.parent ? category.parent.ID : null
        };
    }

    // Add products
    this.productIds = resultObj.docs.map(function (productData) {
        return {
            productSearchHit: productData,
            productID: productData.pid
        };
    });

    this.autoCorrectQuery = searchResult.object.autoCorrectQuery || '';
    var searchQuery = libBloomreach.formatSearchPhrase(params.q);
    this.query = searchQuery || '';
    this.searchKeywords = this.autoCorrectQuery || searchQuery || '';

    if ('keywordRedirect' in searchResult.object && searchResult.object.keywordRedirect) {
        var redirectUrl = searchResult.object.keywordRedirect['redirected url'] || URLUtils.url('Search-Show', 'q', searchResult.object.keywordRedirect['redirected query']);
        this.redirect = redirectUrl;
    }

    if ('did_you_mean' in searchResult.object && searchResult.object.did_you_mean.length) {
        var suggestedQueries = [];
        suggestedQueries = searchResult.object.did_you_mean.map(function (suggestion) {
            return {
                value: suggestion,
                url: URLUtils.url('Search-Show', 'q', suggestion)
            };
        });
        this.isSearchSuggestionsAvailable = !!suggestedQueries.length;
        this.suggestionPhrases = suggestedQueries;
    }

    if ('campaign' in searchResult.object) {
        this.campaign = {
            id: searchResult.object.campaign.id,
            bannerType: searchResult.object.campaign.bannerType,
            dateStart: searchResult.object.campaign.dateStart,
            dateEnd: searchResult.object.campaign.dateEnd,
            htmlText: searchResult.object.campaign.htmlText,
            keyword: searchResult.object.campaign.keyword,
            name: searchResult.object.campaign.keyword
        };
        this.isCategorySearch = false;
    }

    // Add refinements
    decorators.refinements(this, searchResult, params);

    // Add sorting
    decorators.sorting(this, params);

    // Add show more URL
    decorators.showMoreUrl(this, params);

    this.resetLink = params.cgid
        ? URLUtils.url('Search-ShowAjax', 'cgid', params.cgid).toString()
        : URLUtils.url('Search-ShowAjax', 'q', params.q).toString();
}

module.exports = SearchResult;
