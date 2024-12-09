# Description
Bloomreach is a cloud-based e-commerce experience platform and B2B service specializing in marketing automation, product discovery, and content management systems.
The Bloomreach SalesForce connector is a community-supported tool. It is fully Open-Sourced and open to contributions.

# Version
## [23.1.0] - 2023 August

## For version history see the [Changelog](CHANGELOG.md)

# Getting Started

1. Clone this repository.
2. Run  `npm install`  to install all of the local dependencies.
3. Run  `npm run compile:js` to compile client-side javascript. (make sure the paths to app_storefront_base is correct in the `package.json` file)
```javascript
"paths": {
    "base": "../storefront-reference-architecture/cartridges/app_storefront_base/"
}
```
4. Run  `npm run compile:scss` to compile scss.
5. Find the __/documentation__ directory within the cloned repository.
6. Follow the SFRA document to integrate and upload the cartridges, import environment data, and configure site preferences

## Testing & Linting
Use  `npm run test`  to run unit tests
Use  `npm run test:integration`  to run integration tests (make sure you have a `dw.json` file in the root folder and correct Site ID in `it.config.js` file)
Use  `npm run lint`  to run linter

# Documentation
You can find documentation in the documentation folder of the repository:
[Integration Guide SFRA](...)
or in Google Docs:
[Integration Guide SFRA](...)

# Contributing

The Bloomreach SalesForce connector is a community-supported tool. You can submit a PR for our team to review.

## Contacts

[ICDLP team](https://confluence.ontrq.com/display/3PD/Team+Info)
