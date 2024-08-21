/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, { enumerable: true, get: getter });
/******/ 		}
/******/ 	};
/******/
/******/ 	// define __esModule on exports
/******/ 	__webpack_require__.r = function(exports) {
/******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 		}
/******/ 		Object.defineProperty(exports, '__esModule', { value: true });
/******/ 	};
/******/
/******/ 	// create a fake namespace object
/******/ 	// mode & 1: value is a module id, require it
/******/ 	// mode & 2: merge all properties of value into the ns
/******/ 	// mode & 4: return value when already ns object
/******/ 	// mode & 8|1: behave like require
/******/ 	__webpack_require__.t = function(value, mode) {
/******/ 		if(mode & 1) value = __webpack_require__(value);
/******/ 		if(mode & 8) return value;
/******/ 		if((mode & 4) && typeof value === 'object' && value && value.__esModule) return value;
/******/ 		var ns = Object.create(null);
/******/ 		__webpack_require__.r(ns);
/******/ 		Object.defineProperty(ns, 'default', { enumerable: true, value: value });
/******/ 		if(mode & 2 && typeof value != 'string') for(var key in value) __webpack_require__.d(ns, key, function(key) { return value[key]; }.bind(null, key));
/******/ 		return ns;
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = "./cartridges/int_bloomreach_sfra/cartridge/client/default/js/blrRecomend.js");
/******/ })
/************************************************************************/
/******/ ({

/***/ "../storefront-reference-architecture/cartridges/app_storefront_base/cartridge/client/default/js/util.js":
/*!***************************************************************************************************************!*\
  !*** ../storefront-reference-architecture/cartridges/app_storefront_base/cartridge/client/default/js/util.js ***!
  \***************************************************************************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = function (include) {
    if (typeof include === 'function') {
        include();
    } else if (typeof include === 'object') {
        Object.keys(include).forEach(function (key) {
            if (typeof include[key] === 'function') {
                include[key]();
            }
        });
    }
};


/***/ }),

/***/ "./cartridges/int_bloomreach_sfra/cartridge/client/default/js/blrRecomend.js":
/*!***********************************************************************************!*\
  !*** ./cartridges/int_bloomreach_sfra/cartridge/client/default/js/blrRecomend.js ***!
  \***********************************************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var processInclude = __webpack_require__(/*! base/util */ "../storefront-reference-architecture/cartridges/app_storefront_base/cartridge/client/default/js/util.js");

/*
 * Digital River Invoice & Credit Memo
 */
$(document).ready(function () {
    processInclude(__webpack_require__(/*! ./pixel/recommendation */ "./cartridges/int_bloomreach_sfra/cartridge/client/default/js/pixel/recommendation.js"));
});


/***/ }),

/***/ "./cartridges/int_bloomreach_sfra/cartridge/client/default/js/pixel/recommendation.js":
/*!********************************************************************************************!*\
  !*** ./cartridges/int_bloomreach_sfra/cartridge/client/default/js/pixel/recommendation.js ***!
  \********************************************************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


/**
 * Add Pixel click cvent to the HTML container
 * @param {string} container - HTML container
 * @returns {Object} -contayner with click events
 */
function addPixelClickEvent(container) {
    return $(container).on('click', '.image-container', function () {
        var href = $(this).find('a').attr('href');
        var paramsArr = href.split('pid=');
        var pid = paramsArr.length > 1 ? paramsArr[1].split('&')[0] : '';

        var $widget = $(this).closest('.recommends-widget');
        var widgetData = {
            wid: $widget.data('widget_id'),
            wty: $widget.data('wty'),
            wrid: $widget.data('wrid'),
            wq: $widget.data('query') || $widget.data('cat_id'),
            item_id: pid
        };
        // eslint-disable-next-line no-undef
        BrTrk.getTracker().logEvent('widget', 'widget-click', widgetData, true);
    });
}

module.exports = {
    updateWidget: function () {
        $('body').on('widget:update', function (e, data) {
            $('.recommends-container').each(function () {
                var $container = $(this);
                var $widget = $container.find('.recommends-widget');
                var widgetViewData = {
                    wid: $widget.data('widget_id'),
                    wty: $widget.data('wty')
                };

                var url = $container.data('url');
                var queryArr = [];
                $.each($widget.data(), function (key, value) {
                    var val = (data && data[key] !== null && data[key] !== undefined) ? data[key] : value;
                    queryArr.push(key + '=' + val);
                });

                if (queryArr.length > 0) {
                    url += '?' + queryArr.join('&');
                }

                $widget.spinner().start();
                $.ajax({
                    url: url,
                    method: 'GET',
                    success: function (response) {
                        widgetViewData.wrid = $(response).data('wrid');
                        widgetViewData.wq = $(response).data('query') || $widget.data('cat_id');

                        var widgetContent = addPixelClickEvent(response);
                        $container.empty().append(widgetContent);

                        $.spinner().stop();
                        // eslint-disable-next-line no-undef
                        BrTrk.getTracker().logEvent('widget', 'widget-view', widgetViewData, true);
                    },
                    error: function () {
                        $.spinner().stop();
                    }
                });
            });
        });
    },
    pixelViewPortEvent: function () {
        $(document).on('resize scroll', function () {
            let element = $('.recommends-container');
            if (element.length) {
                let viewportTop = $(window).scrollTop();
                let viewportBottom = viewportTop + $(window).height();

                let elementTop = element.offset().top;
                let isVisible = elementTop < viewportBottom;
                let trigered = element.data('trigered');

                if (isVisible && !trigered) {
                    element.data('trigered', true);
                    $('body').trigger('widget:update', null);
                }
            }
        });
    }
};


/***/ })

/******/ });
//# sourceMappingURL=blrRecomend.js.map