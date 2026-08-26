'use script';

const URLUtils = require('dw/web/URLUtils');

/**
 * Get string with the first letter of a string uppercase
 * @param {string} str - string
 * @returns {string} - string with the first letter of a string uppercase
 */
function capitalizeFirstLetter(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
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
 * Create SFCC search refinements from Bloomreach API search result
 * @param {Object} searchResult - Bloomreach API search result
 * @param {Object} params - current URL search parameters
 * @returns {Object} - search refinements
 */
function getRefinements(searchResult, params) {
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

module.exports = function (object, searchResult, httpParams) {
    Object.defineProperty(object, 'refinements', {
        enumerable: true,
        value: getRefinements(searchResult, httpParams)
    });
};
