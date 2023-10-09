'use strict';

const CatalogMgr = require('dw/catalog/CatalogMgr');
const ContentMgr = require('dw/content/ContentMgr');
const URLUtils = require('dw/web/URLUtils');

const bloomreachServiceHelper = require('*/cartridge/scripts/services/blrServiceHelper');
const preferences = require('*/cartridge/config/preferences');
const libBloomreach = require('*/cartridge/scripts/bloomreach/lib/libBloomreach');

const DEFAULT_PAGE_SIZE = preferences.defaultPageSize ? preferences.defaultPageSize : 12;
var searchQuery = '';

/**
 * Get string with the first letter of a string uppercase
 * @param {string} str - string
 * @returns {string} - string with the first letter of a string uppercase
 */
function capitalizeFirstLetter(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

/**
 * URL safe formats query string
 * @param {string} query - query string
 * @returns {string} - URL safe formaed query string
 */
function formatSearchPhrase(query) {
    return query && !!query.trim() ? encodeURI(query) : '*';
}

/**
 * Create copy of the object
 * @param {Object} obj - object
 * @returns {Object} -copy of object
 */
function copyObject(obj) {
    var newObj = null;

    if (obj && typeof obj === 'object') {
        try {
            var objStr = JSON.stringify(obj);
            newObj = JSON.parse(objStr);
        } catch (error) {
            return null;
        }
    }

    return newObj;
}

/**
 * Add view code paramert to search details
 * @param {Object} searchDetails - Bloomreach search details object
 */
function applySearchViewId(searchDetails) {
    if (libBloomreach.getPreference('MiltiCurrency').value === 'priceAsView') {
        searchDetails.view_id = libBloomreach.getViewId(); // eslint-disable-line no-param-reassign
    }
}

/**
 * Set content search configuration values
 *
 * @param {Object} params - Provided HTTP query parameters
 * @return {Object} - API search params
 */
function setupContentSearch(params) {
    var locale = request.locale && request.locale.indexOf('_') !== -1 ? '_' + request.locale.split('_')[0] : '';
    var searchDetails = {};
    searchDetails.url = request.httpURL.toString().replace('?' + request.httpQueryString, '');
    searchDetails.catalog_name = libBloomreach.getPreference('ContentDomainKey') + locale;
    searchDetails.request_type = 'search';
    searchDetails.search_type = 'keyword';
    searchDetails.q = formatSearchPhrase(params.q ? unescape(params.q) : (request.httpParameterMap.q ? unescape(request.httpParameterMap.q.value) : null));
    searchDetails.fl = libBloomreach.getPreference('ContentSearchResponseFields');
    searchDetails.rows = params.sz || DEFAULT_PAGE_SIZE;
    searchDetails.start = params.startingPage || 0;
    applyRelevanceBySegmentParameter(searchDetails);
    return searchDetails;
}
/**
 * Format Bloomreach search result
 *
 * @param {Object} searchResult - search result
 * @param {string} queryPhrase - query phrase
 * @return {Object} - formatted search result
 */
function formatContentSearchResult(searchResult, queryPhrase) {
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
 * Set the relevance by segment param
 *
 * @param {Object} searchDetails - Search details object
 */
function applyRelevanceBySegmentParameter(searchDetails) {
    var customer = request.session.customer;
    if (libBloomreach.getPreference('enableRelevanceBySegment')) {
        var segmentType = libBloomreach.getPreference('relevanceBySegmentType').value;

        switch (segmentType) {
            case 'customer_tier':
                if (customer.customerGroups.length) {
                    var allCustomerGroups = [];
                    for (var index = 0; index < customer.customerGroups.length; index++) {
                        allCustomerGroups.push(customer.customerGroups[index].ID);
                    }
                    searchDetails.segment = 'customer_tier:' + allCustomerGroups.join(','); // eslint-disable-line no-param-reassign
                }
                break;
            case 'customer_country':
                if (customer.profile && customer.profile.addressBook.preferredAddress) {
                    searchDetails.segment = 'customer_country:' + customer.profile.addressBook.preferredAddress.countryCode.value; // eslint-disable-line no-param-reassign
                }
                break;
            case 'customer_geo':
                searchDetails.segment = 'customer_geo:' + request.geolocation.countryCode; // eslint-disable-line no-param-reassign
                break;
            case 'customer_profile':
                if (customer.profile) {
                    searchDetails.segment = 'customer_profile:' + customer.profile.customerNo; // eslint-disable-line no-param-reassign
                }
                break;
            case 'view_id':
                searchDetails.segment = 'view_id:' + request.geolocation.countryCode; // eslint-disable-line no-param-reassign
                break;
            case 'user_id':
                searchDetails.segment = 'user_id:' + customer.profile.customerNo; // eslint-disable-line no-param-reassign
                break;
            default:
                break;
        }
    }
}

/**
 * Set categiry search configuration values
 *
 * @param {Object} params - Provided HTTP query parameters
 * @return {Object} - API search params
 */
function setupSearch(params) {
    searchQuery = formatSearchPhrase(params.q ? unescape(params.q) : null);

    // Set base search
    var url = request.httpURL.toString();
    var urlparts = url.split('?');
    var searchDetails = {
        url: urlparts[0],
        request_id: request.requestID,
        request_type: 'search',
        rows: params.sz || DEFAULT_PAGE_SIZE,
        start: params.start || 0,
        fl: libBloomreach.getPreference('returnProductIDsOnly') ? 'pid' : libBloomreach.getPreference('SearchResponseFields'),
        facet: {
            range: 'price'
        }
    };

    var facets = [];
    if (searchQuery && searchQuery !== '*') {
        searchDetails.search_type = 'keyword';
        searchDetails.q = searchQuery;
        if (params.cgid) {
            facets.push('category:("' + params.cgid + '")');
        }
    } else {
        searchDetails.search_type = 'category';
        searchDetails.q = params.cgid || 'root';
        searchQuery = '';
    }

    if (params.groupby) {
        searchDetails.groupby = params.groupby;
    }

    if (libBloomreach.getPreference('StatsFields')) {
        searchDetails['stats.field'] = libBloomreach.getPreference('StatsFields');
    }

    applySearchViewId(searchDetails);
    applyRelevanceBySegmentParameter(searchDetails);

    // Set price range
    if (params.pmin || params.pmax) {
        var searchPhrase = 'price:[';
        searchPhrase += params.pmin ? params.pmin : '*';
        searchPhrase += ' TO ';
        searchPhrase += params.pmax ? params.pmax : '*';
        searchPhrase += ']';
        searchDetails.fq = encodeURI(searchPhrase);
    }

    // Set facets search
    if (params.preferences) {
        Object.keys(params.preferences).forEach(function (key) {
            if (key !== 'sortrule' && key !== 'sortval') {
                var prefs = params.preferences[key].split('|');
                var prefsInQuotes = prefs.map(function (item) {
                    return '"' + item + '"';
                });
                var str = key + ':(' + prefsInQuotes.join(' OR ') + ')';
                facets.push(str);
            }
        });
    }

    if (facets.length > 0) {
        searchDetails.efq = encodeURI(facets.join(' AND '));
    }

    // Set sorting rules
    var sortValue = params.sortval || null;
    var sortRule = params.sortrule || 'asc';

    if (!sortValue && params.preferences && params.preferences.sortval) {
        sortValue = params.preferences.sortval || null;
    }

    if (!sortRule && params.preferences && params.preferences.sortrule) {
        sortValue = params.preferences.sortrule || null;
    }

    if (sortValue) {
        var sortPhrase = sortValue + ' ' + sortRule;
        searchDetails.sort = encodeURI(sortPhrase);
    }

    return searchDetails;
}

/**
 * Get query link with sorting parameters
 * @param {Object} params - current URL search parameters
 * @param {string} sortItemName - name of sorting parameter
 * @param {string} rule - sorting rule asc/desc
 * @returns {string} - string URL
 */
function getSortQueryLink(params, sortItemName, rule) {
    var sorturl = URLUtils.url('Search-UpdateGrid');
    var allowedParams = ['q', 'cgid', 'pmin', 'pmax', 'srule', 'pmid'];

    Object.keys(params).forEach(function (element) {
        if (allowedParams.indexOf(element) > -1) {
            sorturl.append(element, params[element]);
        }

        if (element === 'preferences') {
            var i = 1;
            Object.keys(params[element]).forEach(function (preference) {
                sorturl.append('prefn' + i, preference);
                sorturl.append('prefv' + i, params[element][preference]);
                i++;
            });
        }
    });
    if (params.start) {
        sorturl.append('sz', Number(params.start) + Number(params.sz));
    }

    sorturl.append('start', 0);

    sorturl.append('sortval', sortItemName);
    sorturl.append('sortrule', rule);

    return sorturl.toString();
}

/**
 * Get list of sorting options
 * @param {Object} params - current URL search parameters
 * @returns {Object} - sorting options
 */
function setupProductSort(params) {
    var Resource = require('dw/web/Resource');
    var searchFields = libBloomreach.getPreference('SearchResponseFields');
    var allowedSortParams = ['pid', 'title', 'price', 'brand'];
    var sortOptions = [];

    var searchFieldsArr = searchFields.split(',');
    searchFieldsArr.forEach(function (item) {
        if (allowedSortParams.indexOf(item) > -1) {
            var ascSort = {
                id: item + '-asc',
                url: getSortQueryLink(params, item, 'asc'),
                displayName: Resource.msg(`label.sort.${item}.asc`, 'search', null)
            };
            var descSort = {
                id: item + '-desc',
                url: getSortQueryLink(params, item, 'desc'),
                displayName: Resource.msg(`label.sort.${item}.desc`, 'search', null)
            };
            sortOptions.push(ascSort);
            sortOptions.push(descSort);
        }
    });

    return {
        options: sortOptions
    };
}

/**
 * Get URL search string
 * @param {Object} params - current URL search parameters
 * @param {Object} queryParams - selected search parameters
 * @returns {string} - new URL search string
 */
function getQueryLink(params, queryParams) {
    var refineurl = URLUtils.url('Search-ShowAjax');
    var allowedParams = ['q', 'cgid', 'pmin', 'pmax', 'srule', 'pmid'];
    var i = 1;

    var query = copyObject(queryParams);

    Object.keys(params).forEach(function (element) {
        if (allowedParams.indexOf(element) > -1) {
            if (query[element]) {
                if (params[element] && query[element].toString() !== params[element].toString()) {
                    refineurl.append(element, query[element]);
                }
                delete query[element];
            } else {
                refineurl.append(element, params[element]);
            }
        }

        if (element === 'preferences') {
            var queryPreferences = query.preferences || {};
            Object.keys(params[element]).forEach(function (preference) {
                if (queryPreferences[preference]) {
                    var val = (params[element][preference]).split('|');
                    if (val.indexOf(queryPreferences[preference]) > -1) {
                        val = val.filter(function (item) {
                            return item !== queryPreferences[preference];
                        });
                    } else {
                        val.push(queryPreferences[preference]);
                    }
                    if (val.length) {
                        refineurl.append('prefn' + i, preference);
                        refineurl.append('prefv' + i, val.join('|'));
                        i++;
                    }
                    delete query.preferences[preference];
                } else {
                    refineurl.append('prefn' + i, preference);
                    refineurl.append('prefv' + i, params[element][preference]);
                    i++;
                }
            });
        }
    });

    Object.keys(query).forEach(function (item) {
        if (item === 'preferences') {
            Object.keys(query.preferences).forEach(function (prefName) {
                refineurl.append('prefn' + i, prefName);
                refineurl.append('prefv' + i, query.preferences[prefName]);
                i++;
            });
        } else {
            refineurl.append(item, query[item]);
        }
    });

    var result = refineurl.toString();
    return result;
}

/**
 * Create category tree from data set
 * @param {Array} dataset - categiry data set
 * @param {Object} params - current URL search parameters
 * @returns {Array} - category tree
 */
function getCategoryTree(dataset, params) {
    var hashTable = {};
    dataset.forEach(function (item) {
        var selected = params.cgid ? (params.cgid === item.cat_id) : false;
        var category = {
            id: item.cat_id,
            displayValue: item.cat_name,
            url: getQueryLink(params, { cgid: item.cat_id }),
            title: 'Current Refined by Cetegiry: ' + item.cat_name,
            selectable: true,
            selected: selected,
            type: 'category',
            subCategories: []
        };
        hashTable[category.id] = category;
    });

    var categoryTree = [];
    dataset.forEach(function (item) {
        if (item.parent) {
            hashTable[item.parent].subCategories.push(hashTable[item.cat_id]);
        } else {
            categoryTree.push(hashTable[item.cat_id]);
        }
    });

    // Remove root catrgory from category tree
    return (categoryTree.length === 1 && categoryTree[0].id === 'root')
        ? categoryTree[0].subCategories
        : categoryTree;
}

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
 * Set search suggestions configuration values
 *
 * @param {Object} querystring - Provided HTTP query parameters
 * @return {Object} - API search params
 */
function setupProductSearchSuggestions(querystring) {
    var searchDetails = {};
    searchDetails.q = querystring;
    searchDetails.url = request.httpURL.toString();
    searchDetails.ref_url = request.httpURL.toString();
    searchDetails.request_id = request.requestID;
    searchDetails.request_type = 'suggest';
    applySearchViewId(searchDetails);

    return searchDetails;
}

/**
* returns appropriate suggestions
*
* @param {string} querystring - search query
* @return {Object} - an object with relevant suggestions information
*/
function getSearchSuggestions(querystring) {
    var blrServiceHelper = require('*/cartridge/scripts/services/blrServiceHelper');
    var suggestions = {};
    var searchData = setupProductSearchSuggestions(querystring);
    var searchSuggestions = blrServiceHelper.performSearchSuggestions(searchData);
    suggestions = setupSuggestions(searchSuggestions.object);
    return suggestions;
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
 * Generates URL for [Show] More button
 *
 * @param {Object} productSearch - Product search object
 * @param {Object} httpParams - HTTP query parameters
 * @return {string} - More button URL
 */
function getShowMoreUrl(productSearch, httpParams) {
    var showMoreEndpoint = 'Search-UpdateGrid';
    var currentStart = httpParams.start || 0;
    var pageSize = httpParams.sz || DEFAULT_PAGE_SIZE;
    var hitsCount = productSearch.count || 0;
    var nextStart;
    var ProductSearchModel = require('dw/catalog/ProductSearchModel');
    var searchModel = new ProductSearchModel();
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

    productSearch.pageSize = pageSize; // eslint-disable-line no-param-reassign
    productSearch.pageNumber = paging.currentPage; // eslint-disable-line no-param-reassign

    var baseUrl = searchModel.url(showMoreEndpoint);
    var finalUrl = paging.appendPaging(baseUrl);
    return finalUrl;
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
 * Create SFCC search refinements from Bloomreach API search result
 * @param {Object} searchResult - Bloomreach API search result
 * @param {Object} params - current URL search parameters
 * @returns {Object} - search refinements
 */
function formatRefinements(searchResult, params) {
    var refinements = [];

    if (!searchResult.ok) { return refinements; }

    var facetFields = searchResult.object.facet_counts ? searchResult.object.facet_counts.facet_fields : null;
    if (facetFields) {
        Object.keys(facetFields).forEach(function (key) {
            var refinement;
            var data = facetFields[key];
            if (data && data.length > 0) {
                switch (key) {
                    case 'category':
                        refinement = {
                            displayName: capitalizeFirstLetter(key),
                            isAttributeRefinement: false,
                            isCategoryRefinement: true,
                            isPriceRefinement: false,
                            isPromotionRefinement: false,
                            values: getCategoryTree(data, params)
                        };
                        refinements.push(refinement);
                        break;
                    case 'price':
                        break;
                    default:
                        var param = params.preferences ? params.preferences[key] : null;
                        var values = param ? params.preferences[key].split('|') : null;
                        refinement = {
                            displayName: capitalizeFirstLetter(key),
                            isAttributeRefinement: true,
                            isCategoryRefinement: false,
                            isPriceRefinement: false,
                            isPromotionRefinement: false,
                            values: data.map(function (item) {
                                var selected = values ? (values.indexOf(item.name) > -1) : false;
                                var query = {
                                    preferences: {}
                                };
                                query.preferences[key] = item.name;
                                var refinementFilter = {
                                    id: key,
                                    displayValue: item.name,
                                    url: getQueryLink(params, query),
                                    title: 'title',
                                    selectable: true,
                                    selected: selected,
                                    type: 'boolean'
                                };
                                return refinementFilter;
                            })
                        };
                        refinements.push(refinement);
                        break;
                }
            }
        });
    }

    // Add price ranges
    var facetRanges = searchResult.object.facet_counts ? searchResult.object.facet_counts.facet_ranges : null;
    if (facetRanges.price) {
        var prices = facetRanges.price;
        var preceRefinement = {
            displayName: 'Price',
            isAttributeRefinement: false,
            isCategoryRefinement: false,
            isPriceRefinement: true,
            isPromotionRefinement: false,
            values: prices.map(function (item) {
                var displayValue = item.start + ' - ' + item.end;
                var selected = (params.pmin + ' - ' + params.pmax) === displayValue;
                var query = {
                    pmin: item.start,
                    pmax: item.end
                };
                var priceFilter = {
                    displayValue: displayValue,
                    url: getQueryLink(params, query),
                    title: 'Refine by Price: ' + displayValue,
                    selected: selected
                };
                return priceFilter;
            })
        };
        refinements.push(preceRefinement);
    }
    return refinements;
}

/**
 * Format Bloomreach search result
 *
 * @param {Object} searchResult - search result
 * @param {string} categoryId - category id for Category search
 * @param {Object} params - current URL search parameters
 * @return {Object} - formatted search result
 */
function formatSearchResult(searchResult, categoryId, params) {
    var productSearch = {};
    if (searchResult.ok) {
        var resultObj = searchResult.object.response;
        productSearch.searchKeywords = '';
        productSearch.count = resultObj.numFound;

        // Add category
        productSearch.isCategorySearch = !!categoryId;
        if (categoryId) {
            var category = CatalogMgr.getCategory(categoryId);
            productSearch.category = {
                id: category.ID,
                name: category.displayName,
                pageDescription: category.pageDescription,
                pageKeywords: category.pageKeywords,
                pageTitle: category.pageTitle,
                parentId: category.parent ? category.parent.ID : null
            };
        }

        // Add products
        productSearch.productIds = resultObj.docs.map(function (productData) {
            return {
                productSearchHit: productData,
                productID: productData.pid
            };
        });
        productSearch.autoCorrectQuery = searchResult.object.autoCorrectQuery || '';
        productSearch.query = searchQuery || '';
        productSearch.searchKeywords = productSearch.autoCorrectQuery || searchQuery || '';
        if ('keywordRedirect' in searchResult.object && searchResult.object.keywordRedirect) {
            var redirectUrl = searchResult.object.keywordRedirect['redirected url'] || URLUtils.url('Search-Show', 'q', searchResult.object.keywordRedirect['redirected query']);
            productSearch.redirect = redirectUrl;
        }
        if ('did_you_mean' in searchResult.object && searchResult.object.did_you_mean.length) {
            var suggestedQueries = [];
            suggestedQueries = searchResult.object.did_you_mean.map(function (suggestion) {
                return {
                    value: suggestion,
                    url: URLUtils.url('Search-Show', 'q', suggestion)
                };
            });
            productSearch.isSearchSuggestionsAvailable = !!suggestedQueries.length;
            productSearch.suggestionPhrases = suggestedQueries;
        }
        if ('campaign' in searchResult.object) {
            productSearch.campaign = {
                id: searchResult.object.campaign.id,
                bannerType: searchResult.object.campaign.bannerType,
                dateStart: searchResult.object.campaign.dateStart,
                dateEnd: searchResult.object.campaign.dateEnd,
                htmlText: searchResult.object.campaign.htmlText,
                keyword: searchResult.object.campaign.keyword,
                name: searchResult.object.campaign.keyword
            };
            productSearch.isCategorySearch = false;
        }

        // Add refinements
        productSearch.refinements = formatRefinements(searchResult, params);

        // Add sorting
        productSearch.productSort = setupProductSort(params);
        productSearch.resetLink = params.cgid
            ? URLUtils.url('Search-ShowAjax', 'cgid', params.cgid).toString()
            : URLUtils.url('Search-ShowAjax', 'q', params.q).toString();
    } else {
        // Create empty search result
        productSearch.searchKeywords = '';
        productSearch.count = 0;
        productSearch.isCategorySearch = false;
        productSearch.productIds = [];
        productSearch.autoCorrectQuery = '';
        productSearch.query = '';
        productSearch.searchKeywords = '';
        productSearch.refinements = [];
        productSearch.productSort = [];
    }

    return productSearch;
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

    var categoryTemplate = '';
    var maxSlots = 4;
    var productSearch;
    var reportingURLs;
    var apiProductSearch;

    var categoryId = req.querystring.cgid || null;
    var searchData = setupSearch(req.querystring);

    apiProductSearch = bloomreachServiceHelper.performSearch(searchData);
    productSearch = formatSearchResult(apiProductSearch, categoryId, req.querystring);

    if (productSearch.redirect) {
        return { searchRedirect: productSearch.redirect };
    }
    productSearch.showMoreUrl = getShowMoreUrl(productSearch, req.querystring);

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

/**
 * Performs a search
 *
 * @param {Object} req - Provided HTTP query parameters
 * @param {Object} res - Provided HTTP query parameters
 * @return {Object} - content search instance
 */
function сontentSearch(req, res) {
    var searchData = setupContentSearch(req.querystring);
    var apiContentSearch = bloomreachServiceHelper.performSearch(searchData);
    var contentSearch = formatContentSearchResult(apiContentSearch, req.querystring.q);
    contentSearch.moreContentUrl = getShowMoreContentUrl(contentSearch, req.querystring);
    return contentSearch;
}

module.exports = {
    getSearchSuggestions: getSearchSuggestions,
    getCategoryTemplate: getCategoryTemplate,
    applyCache: applyCache,
    search: search,
    backButtonDetection: backButtonDetection,
    сontentSearch: сontentSearch
};
