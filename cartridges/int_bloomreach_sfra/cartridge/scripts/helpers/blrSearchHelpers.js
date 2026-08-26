'use strict';

const CatalogMgr = require('dw/catalog/CatalogMgr');
const URLUtils = require('dw/web/URLUtils');

const apiSearchHelper = require('*/cartridge/scripts/helpers/blrApiSearchHelper');
const preferences = require('*/cartridge/config/preferences');

/**
* generate appropriate suggestions from bloomreach response
*
* @param {Object} searchSuggestions - object with bloomreach suggestions
* @return {Object} - an object with relevant suggestions information
*/
function setupSuggestions(searchSuggestions) {
    var result = {};
    result.productSuggestions = { available: false, products: [], phrases: [] };
    result.categorySuggestions = { available: false, categories: [] };

    if (searchSuggestions.suggestionGroups.length) {
        for (var i = 0; i < searchSuggestions.suggestionGroups.length; i++) {
            var suggestion = searchSuggestions.suggestionGroups[i];

            var attributeSuggestionsList = suggestion.attributeSuggestions;
            if (attributeSuggestionsList && attributeSuggestionsList.length) {
                result.categorySuggestions.available = true;
                for (var j = 0; j < attributeSuggestionsList.length; j++) {
                    var category = CatalogMgr.getCategory(attributeSuggestionsList[j].value);
                    result.categorySuggestions.available = true;
                    result.categorySuggestions.categories.push({
                        imageUrl: category.image ? category.image.url : null,
                        name: category.displayName,
                        parentID: category.parent ? category.parent.ID : null,
                        parentName: category.parent ? category.parent.displayName : null,
                        url: URLUtils.https('Search-Show', 'cgid', category.ID)
                    });
                }
            }

            var searchSuggestionsList = suggestion.searchSuggestions;
            if (searchSuggestionsList && searchSuggestionsList.length) {
                result.productSuggestions.available = true;
                for (var k = 0; k < searchSuggestionsList.length; k++) {
                    result.productSuggestions.products.push({
                        imageUrl: searchSuggestionsList[k].thumb_image,
                        name: searchSuggestionsList[k].title,
                        url: searchSuggestionsList[k].url
                    });
                }
            }

            var querySuggestionsList = suggestion.querySuggestions;
            if (querySuggestionsList && querySuggestionsList.length) {
                result.productSuggestions.available = true;
                for (var l = 0; l < querySuggestionsList.length; l++) {
                    result.productSuggestions.phrases.push({
                        value: querySuggestionsList[l].query,
                        url: URLUtils.url('Search-Show', 'q', querySuggestionsList[l].query)
                    });
                }
            }
        }
    }
    return result;
}

/**
* returns appropriate suggestions
*
* @param {string} querystring - search query
* @return {Object} - an object with relevant suggestions information
*/
function getSearchSuggestions(querystring) {
    var searchSuggestions = apiSearchHelper.getApiSearchSuggestions(querystring);
    return setupSuggestions(searchSuggestions.object);
}

/**
 * Retrieve a category's template filepath if available
 *
 * @param {string} cgid - API search instance
 * @return {string} - Category's template filepath
 */
function getCategoryTemplate(cgid) {
    if (cgid) {
        var category = CatalogMgr.getCategory(cgid);
        return category ? category.template : '';
    }
    return '';
}

/**
 * Set the cache values
 *
 * @param {Object} res - The response object
 */
function applyCache(res) {
    res.cachePeriod = 1; // eslint-disable-line no-param-reassign
    res.cachePeriodUnit = 'hours'; // eslint-disable-line no-param-reassign
    res.personalized = true; // eslint-disable-line no-param-reassign
}

/**
 * performs a search
 *
 * @param {Object} req - Provided HTTP query parameters
 * @param {Object} res - Provided HTTP query parameters
 * @return {Object} - an object with relevant search information
 * @param {Object} httpParameterMap - Query params
 */
function search(req, res) {
    var pageMetaHelper = require('*/cartridge/scripts/helpers/pageMetaHelper');
    var reportingUrlsHelper = require('*/cartridge/scripts/reportingUrls');
    var schemaHelper = require('*/cartridge/scripts/helpers/structuredDataHelper');
    var SearchResultModel = require('*/cartridge/models/bloomreach/search');

    var categoryTemplate = '';
    var maxSlots = 4;
    var productSearch;
    var reportingURLs;
    var apiProductSearch;

    var categoryId = req.querystring.cgid || null;

    apiProductSearch = apiSearchHelper.getProductApiSearch(req.querystring);
    productSearch = new SearchResultModel(apiProductSearch, categoryId, req.querystring);

    if (productSearch.redirect) {
        return { searchRedirect: productSearch.redirect };
    }

    if (!productSearch.personalizedSort) {
        applyCache(res);
    }
    categoryTemplate = getCategoryTemplate(req.querystring.cgid);

    pageMetaHelper.setPageMetaTags(req.pageMetaData, productSearch);

    var canonicalUrl = URLUtils.url('Search-Show', 'cgid', req.querystring.cgid);
    var refineurl = URLUtils.url('Search-Refinebar');
    var allowedParams = ['q', 'cgid', 'pmin', 'pmax', 'srule', 'pmid'];
    var isRefinedSearch = false;

    Object.keys(req.querystring).forEach(function (element) {
        if (allowedParams.indexOf(element) > -1) {
            refineurl.append(element, req.querystring[element]);
        }

        if (['pmin', 'pmax'].indexOf(element) > -1) {
            isRefinedSearch = true;
        }

        if (element === 'preferences') {
            var i = 1;
            isRefinedSearch = true;
            Object.keys(req.querystring[element]).forEach(function (preference) {
                refineurl.append('prefn' + i, preference);
                refineurl.append('prefv' + i, req.querystring[element][preference]);
                i++;
            });
        }
    });

    if (productSearch.searchKeywords && !isRefinedSearch) {
        reportingURLs = reportingUrlsHelper.getProductSearchReportingURLs(productSearch);
    }

    var result = {
        productSearch: productSearch,
        maxSlots: maxSlots,
        reportingURLs: reportingURLs,
        refineurl: refineurl,
        canonicalUrl: canonicalUrl,
        apiProductSearch: apiProductSearch
    };

    if (productSearch.isCategorySearch && !productSearch.isRefinedCategorySearch && categoryTemplate && productSearch.category.parentId === 'root') {
        pageMetaHelper.setPageMetaData(req.pageMetaData, productSearch.category);
        result.category = productSearch.category;
        result.categoryTemplate = categoryTemplate;
    }

    if (productSearch.campaign) {
        result.campaign = productSearch.campaign;
    }

    if (!categoryTemplate || categoryTemplate === 'rendering/category/categoryproducthits') {
        result.schemaData = schemaHelper.getListingPageSchema(productSearch.productIds);
    }

    return result;
}

/**
* check to see if we are coming back from a pdp, if yes, use the old qs to set up the grid refinements and number of tiles
*
* @param {Object} clickStream - object with an array of request to the server in the current session
* @return {string} - url to redirect to
*/
function backButtonDetection(clickStream) {
    if (!preferences.plpBackButtonOn) {
        return null;
    }

    var currentClick;
    var limit = preferences.plpBackButtonLimit || 10;
    var clicks = clickStream.clicks.reverse().slice(0, limit);
    var productClick = null;
    var searchClick = null;
    var counter = 0;
    var done = false;

    // find the last pdp click and the last search click
    var backClicks = clicks.filter(function (click) {
        if (counter === 0) {
            currentClick = click;
            counter++;
            return true;
        }

        if (click.pipelineName.indexOf('Product-Show') > -1 && productClick == null && !done) {
            productClick = click;
            counter++;
            return true;
        }

        if ((click.pipelineName.indexOf('Search-Show') > -1 && searchClick == null)
            || (click.pipelineName.indexOf('Search-UpdateGrid') > -1 && searchClick == null)
            || (click.pipelineName.indexOf('Search-ShowAjax') > -1 && searchClick == null)
        ) {
            searchClick = click;
            counter++;
            done = true;
            return true;
        }
        counter++;
        return false;
    });

    if (backClicks.length === 3) {
        var strCurrent = currentClick.queryString;
        var strCurrentArray = strCurrent.split('&');
        var paramCurrentArray = [];
        var valueCurrentArray = [];
        var cgidCurrentValue;
        var qCurrentValue;

        strCurrentArray.forEach(function (strElement) {
            var strElementSplit = strElement.split('=');
            if (strElementSplit[0] === 'cgid') { cgidCurrentValue = strElementSplit[1]; }
            if (strElementSplit[0] === 'q') { qCurrentValue = strElementSplit[1]; }
            paramCurrentArray.push(strElementSplit[0]);
            valueCurrentArray.push(strElementSplit[1]);
        });

        var str = searchClick.queryString;
        var strArray = str.split('&');
        var paramArray = [];
        var valueArray = [];
        var cgidValue;
        var qValue;
        var szPos;
        var startPos;

        strArray.forEach(function (strElement2, i) {
            var strElementSplit2 = strElement2.split('=');
            if (strElementSplit2[0] === 'cgid') { cgidValue = strElementSplit2[1]; }
            if (strElementSplit2[0] === 'q') { qValue = strElementSplit2[1]; }
            if (strElementSplit2[0] === 'sz') { szPos = i; }
            if (strElementSplit2[0] === 'start') { startPos = i; }
            paramArray.push(strElementSplit2[0]);
            valueArray.push(strElementSplit2[1]);
        });

        // alter the sz and start parameters
        if (!!szPos && !!startPos) {
            valueArray[szPos] = parseInt(valueArray[startPos], 10) + parseInt(valueArray[szPos], 10);
            valueArray[startPos] = 0;
        }

        // check that cgid or q parameter are matching and build url with old parameters
        if ((cgidCurrentValue && cgidCurrentValue === cgidValue) || (qCurrentValue && qCurrentValue === qValue)) {
            var redirectGridUrl = URLUtils.url('Search-Show');
            paramArray.forEach(function (param, i) {
                redirectGridUrl.append(paramArray[i], valueArray[i]);
            });
            return redirectGridUrl.toString();
        }
    }
    return null;
}

module.exports = {
    getSearchSuggestions: getSearchSuggestions,
    getCategoryTemplate: getCategoryTemplate,
    applyCache: applyCache,
    search: search,
    backButtonDetection: backButtonDetection
};
