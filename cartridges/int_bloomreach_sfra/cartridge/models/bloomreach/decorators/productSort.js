'use script';

const URLUtils = require('dw/web/URLUtils');
const libBloomreach = require('*/cartridge/scripts/bloomreach/lib/libBloomreach');

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
 * @param {Object} httpParams - current URL search parameters
 * @returns {Object} - sorting options
 */
function getProductSort(httpParams) {
    var Resource = require('dw/web/Resource');
    var searchFields = libBloomreach.getPreference('SearchResponseFields');
    var allowedSortParams = ['pid', 'title', 'price', 'brand'];
    var sortOptions = [];

    var searchFieldsArr = searchFields.split(',');
    searchFieldsArr.forEach(function (item) {
        if (allowedSortParams.indexOf(item) > -1) {
            var ascSort = {
                id: item + '-asc',
                url: getSortQueryLink(httpParams, item, 'asc'),
                displayName: Resource.msg(`label.sort.${item}.asc`, 'search', null)
            };
            var descSort = {
                id: item + '-desc',
                url: getSortQueryLink(httpParams, item, 'desc'),
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

module.exports = function (object, httpParams) {
    Object.defineProperty(object, 'productSort', {
        enumerable: true,
        value: getProductSort(httpParams)
    });
};
