'use strict';

var processInclude = require('base/util');

/*
 * Digital River Invoice & Credit Memo
 */
$(document).ready(function () {
    processInclude(require('./pixel/recommendation'));
});
