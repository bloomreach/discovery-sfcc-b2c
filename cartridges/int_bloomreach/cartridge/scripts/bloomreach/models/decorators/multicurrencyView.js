'use strict';

var Site = require('dw/system/Site');
var Currency = require('dw/util/Currency');

module.exports = function (object, product) {
    var that = object;

    var siteCurrencies = Site.getCurrent().getAllowedCurrencies();
    var siteCurrenciesSize = siteCurrencies.size();

    if (siteCurrenciesSize === 1) { return; }

    that.views = {};

    var currentSession = request.getSession();
    var currentCurrency = currentSession.getCurrency();

    var variants = product.getVariants();

    for (var i = 0; i < siteCurrenciesSize; i += 1) {
        var currency = Currency.getCurrency(siteCurrencies[i]);
        currentSession.setCurrency(currency);
        var currencyCode = currency.getCurrencyCode().toLowerCase();

        // Master product price
        that.views[currencyCode] = {};
        var price = product.productSet ? product.priceModel.minPrice : product.priceModel.price;
        if (price.available) {
            currencyCode = price.currencyCode.toLowerCase();
            that.views[currencyCode].attributes = {
                price: price.value
            };
        }

        // Vatiant product price
        if (variants.length !== 0) {
            var variantsIter = variants.iterator();
            that.views[currencyCode].variants = {};
            while (variantsIter.hasNext()) {
                var variantProduct = variantsIter.next();
                price = variantProduct.productSet ? variantProduct.priceModel.minPrice : variantProduct.priceModel.price;
                if (price.available) {
                    that.views[currencyCode].variants[variantProduct.ID] = {
                        attributes: {
                            price: price.value
                        }
                    };
                }
            }
        }
    }
    currentSession.setCurrency(currentCurrency);
};
