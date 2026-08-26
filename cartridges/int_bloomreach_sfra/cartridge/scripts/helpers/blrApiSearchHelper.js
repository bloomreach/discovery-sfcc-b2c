'use strict';

const bloomreachServiceHelper = require('*/cartridge/scripts/services/blrServiceHelper');
const libBloomreach = require('*/cartridge/scripts/bloomreach/lib/libBloomreach');
const preferences = require('*/cartridge/config/preferences');
const DEFAULT_PAGE_SIZE = preferences.defaultPageSize ? preferences.defaultPageSize : 12;

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
 * Get Bloomreach API products search result
 * @param {Object} httpParams - SFCC HTTP query parameters
 * @returns {Object} - Bloomreach API products search result
 */
function getProductApiSearch(httpParams) {
    var searchQuery = libBloomreach.formatSearchPhrase(httpParams.q);

    // Set base search
    var url = request.httpURL.toString();
    var urlparts = url.split('?');
    var searchDetails = {
        url: urlparts[0],
        ref_url: request.httpReferer ? request.httpReferer : '',
        request_id: request.requestID,
        request_type: 'search',
        rows: httpParams.sz || DEFAULT_PAGE_SIZE,
        start: httpParams.start || 0,
        fl: libBloomreach.getPreference('returnProductIDsOnly') ? 'pid' : libBloomreach.getPreference('SearchResponseFields'),
        facet: {
            range: 'price'
        }
    };

    var facets = [];
    if (searchQuery && searchQuery !== '*') {
        searchDetails.search_type = 'keyword';
        searchDetails.q = searchQuery;
        if (httpParams.cgid) {
            facets.push('category:("' + httpParams.cgid + '")');
        }
    } else {
        searchDetails.search_type = 'category';
        searchDetails.q = httpParams.cgid || 'root';
        searchQuery = '';
    }

    if (httpParams.groupby) {
        searchDetails.groupby = httpParams.groupby;
    }

    if (libBloomreach.getPreference('StatsFields')) {
        searchDetails['stats.field'] = libBloomreach.getPreference('StatsFields');
    }

    applySearchViewId(searchDetails);
    applyRelevanceBySegmentParameter(searchDetails);

    // Set price range
    if (httpParams.pmin || httpParams.pmax) {
        var searchPhrase = 'price:[';
        searchPhrase += httpParams.pmin ? httpParams.pmin : '*';
        searchPhrase += ' TO ';
        searchPhrase += httpParams.pmax ? httpParams.pmax : '*';
        searchPhrase += ']';
        searchDetails.fq = encodeURI(searchPhrase);
    }

    // Set facets search
    if (httpParams.preferences) {
        Object.keys(httpParams.preferences).forEach(function (key) {
            if (key !== 'sortrule' && key !== 'sortval') {
                var prefs = httpParams.preferences[key].split('|');
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
    var sortValue = httpParams.sortval || null;
    var sortRule = httpParams.sortrule || 'asc';

    if (!sortValue && httpParams.preferences && httpParams.preferences.sortval) {
        sortValue = httpParams.preferences.sortval || null;
    }

    if (!sortRule && httpParams.preferences && httpParams.preferences.sortrule) {
        sortValue = httpParams.preferences.sortrule || null;
    }

    if (sortValue) {
        var sortPhrase = sortValue + ' ' + sortRule;
        searchDetails.sort = encodeURI(sortPhrase);
    }

    return bloomreachServiceHelper.performSearch(searchDetails);
}

/**
 * Get Bloomreach API content search result
 * @param {Object} httpParams - SFCC HTTP query parameters
 * @returns {Object} - Bloomreach API content search result
 */
function getContentApiSearch(httpParams) {
    var locale = request.locale && request.locale.indexOf('_') !== -1 ? '_' + request.locale.split('_')[0] : '';
    var searchDetails = {
        url: request.httpURL.toString().replace('?' + request.httpQueryString, ''),
        ref_url: request.httpReferer ? request.httpReferer : '',
        catalog_name: libBloomreach.getPreference('ContentDomainKey') + locale,
        request_type: 'search',
        search_type: 'keyword',
        q: libBloomreach.formatSearchPhrase(httpParams.q || (request.httpParameterMap.q ? request.httpParameterMap.q.value : null)),
        fl: libBloomreach.getPreference('ContentSearchResponseFields'),
        rows: httpParams.sz || DEFAULT_PAGE_SIZE,
        start: httpParams.startingPage || 0
    };

    applyRelevanceBySegmentParameter(searchDetails);

    return bloomreachServiceHelper.performSearch(searchDetails);
}

/**
 * Get Bloomreach API search suggestions result
 * @param {Object} querystring - SFCC search query string
 * @returns {Object} - Bloomreach API search suggestions result
 */
function getApiSearchSuggestions(querystring) {
    var searchDetails = {
        q: querystring,
        url: request.httpURL.toString(),
        ref_url: request.httpReferer ? request.httpReferer : '',
        request_id: request.requestID,
        request_type: 'suggest'
    };

    applySearchViewId(searchDetails);
    return bloomreachServiceHelper.performSearchSuggestions(searchDetails);
}

module.exports = {
    getProductApiSearch: getProductApiSearch,
    getContentApiSearch: getContentApiSearch,
    getApiSearchSuggestions: getApiSearchSuggestions
};
