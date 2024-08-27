'use strict';

const ContentMgr = require('dw/content/ContentMgr');
const URLUtils = require('dw/web/URLUtils');

const apiSearchHelper = require('*/cartridge/scripts/helpers/blrApiSearchHelper');
const preferences = require('*/cartridge/config/preferences');
const DEFAULT_PAGE_SIZE = preferences.defaultPageSize ? preferences.defaultPageSize : 12;

/**
 * Format Bloomreach content search result
 *
 * @param {Object} searchResult - search result
 * @return {Object} - formatted search result
 */
function formatContentSearchResult(searchResult) {
    var contentSearch = {};
    if (!searchResult.error) {
        var resultObj = searchResult.object.response;
        contentSearch.contentCount = resultObj.numFound;
        contentSearch.contents = resultObj.docs.map(function (contentData) {
            var content = ContentMgr.getContent(contentData.item_id);
            return {
                description: content.description,
                name: content.name,
                url: contentData.url
            };
        });
    }
    return contentSearch;
}

/**
 * Generates URL for [Show] More button
 *
 * @param {Object} contentSearch - Content search object
 * @param {Object} httpParams - HTTP query parameters
 * @return {string} - More button URL
 */
function getShowMoreContentUrl(contentSearch, httpParams) {
    var showMoreEndpoint = 'Search-Content';
    var currentStart = httpParams.startingPage || 0;
    var pageSize = httpParams.sz || DEFAULT_PAGE_SIZE;
    var hitsCount = contentSearch.contentCount || 0;
    var nextStart;

    if (pageSize >= hitsCount) {
        return false;
    } else if (pageSize > DEFAULT_PAGE_SIZE) {
        nextStart = pageSize;
    } else {
        if (+currentStart + pageSize >= hitsCount) {
            return false;
        }
        nextStart = +currentStart + pageSize;
        if (!nextStart) {
            return false;
        }
    }

    return URLUtils.url(showMoreEndpoint, 'q', httpParams.q, 'startingPage', nextStart);
}

/**
 * Performs a search
 *
 * @param {Object} req - Provided HTTP query parameters
 * @return {Object} - content search instance
 */
function сontentSearch(req) {
    var apiContentSearch = apiSearchHelper.getContentApiSearch(req.querystring);
    var contentSearch = formatContentSearchResult(apiContentSearch, req.querystring.q);
    contentSearch.moreContentUrl = getShowMoreContentUrl(contentSearch, req.querystring);
    return contentSearch;
}

module.exports = {
    сontentSearch: сontentSearch
};
