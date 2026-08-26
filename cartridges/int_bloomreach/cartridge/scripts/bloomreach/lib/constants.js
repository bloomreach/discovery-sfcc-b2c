'use strict';

const PRODUCT_FEED_LOCAL_PATH = 'bloomreach/product';
const PRODUCT_FEED_PREFIX = 'productfeed';
const PRODUCT_FEED_PATH = 'astound/product_export';

const CONTENT_FEED_LOCAL_PATH = 'bloomreach/content';
const CONTENT_FEED_PREFIX = 'contentfeed';
const CONTENT_FEED_PATH = 'astound/content_export';

const PRODUCT_SNAPSHOT_PREFIX = 'product-snapshot_';

const PRODUCT_REQUIRED_FIELDS = {
    title: 'name',
    category_paths: 'categories',
    price: 'price',
    description: 'longDescription.markup',
    url: 'url',
    availability: 'availabilityModel.inStock',
    brand: 'brand',
    thumb_image: 'thumb_image'
};

const CONTENT_REQUIRED_FIELDS = {
    title: 'name',
    description: 'custom.body.source',
    url: 'url'
};

module.exports = {
    PRODUCT_FEED_LOCAL_PATH: PRODUCT_FEED_LOCAL_PATH,
    PRODUCT_FEED_PREFIX: PRODUCT_FEED_PREFIX,
    PRODUCT_FEED_PATH: PRODUCT_FEED_PATH,
    CONTENT_FEED_LOCAL_PATH: CONTENT_FEED_LOCAL_PATH,
    CONTENT_FEED_PREFIX: CONTENT_FEED_PREFIX,
    CONTENT_FEED_PATH: CONTENT_FEED_PATH,
    PRODUCT_REQUIRED_FIELDS: PRODUCT_REQUIRED_FIELDS,
    CONTENT_REQUIRED_FIELDS: CONTENT_REQUIRED_FIELDS,
    PRODUCT_SNAPSHOT_PREFIX: PRODUCT_SNAPSHOT_PREFIX
};
