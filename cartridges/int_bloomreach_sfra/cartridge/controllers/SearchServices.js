'use strict';

/**
 * @namespace SearchServices
 */

var server = require('server');

var cache = require('*/cartridge/scripts/middleware/cache');

var Resource = require('dw/web/Resource');

var preferences = require('*/cartridge/config/preferences.js');

/**
 * SearchServices-GetSuggestions : The SearchServices-GetSuggestions endpoint is responsible for searching as you type and displaying the suggestions from that search
 * @name Base/SearchServices-GetSuggestions
 * @function
 * @memberof SearchServices
 * @param {middleware} - cache.applyDefaultCache
 * @param {querystringparameter} - q - the query string a shopper is searching for
 * @param {category} - non-sensitive
 * @param {returns} - json
 * @param {serverfunction} - get
 */
server.get('GetSuggestions', cache.applyDefaultCache, function (req, res, next) {
    var searchHelper = require('*/cartridge/scripts/helpers/blrSearchHelpers');
    var categorySuggestions;
    var productSuggestions;
    var searchTerms = req.querystring.q;
    var suggestions;
    // TODO: Move minChars and maxSuggestions to Site Preferences when ready for refactoring
    var minChars = preferences.minTermLength;

    if (searchTerms && searchTerms.length >= minChars) {
        suggestions = searchHelper.getSearchSuggestions(searchTerms);
        productSuggestions = suggestions.productSuggestions;
        categorySuggestions = suggestions.categorySuggestions;

        if (productSuggestions.available
            || categorySuggestions.available) {
            var total = productSuggestions.products.length
                + categorySuggestions.categories.length;
            res.render('search/suggestions', {
                suggestions: {
                    product: productSuggestions,
                    category: categorySuggestions,
                    message: Resource.msgf('label.header.search.result.count.msg', 'common', null, ['' + total])
                }
            });
        } else {
            res.json({});
        }
    } else {
        // Return an empty object that can be checked on the client.  By default, rendered
        // templates automatically get a diagnostic string injected into it, making it difficult
        // to check for a null or empty response on the client.
        res.json({});
    }

    next();
});

module.exports = server.exports();
