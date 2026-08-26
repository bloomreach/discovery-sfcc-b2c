'use strict';

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
