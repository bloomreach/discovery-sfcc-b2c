# Bloomreach Connector for Salesforce Commerce Cloud (SFRA)

This repository is the Bloomreach link cartridge for Salesforce Commerce Cloud
B2C (SFRA). It connects an SFCC storefront to **Bloomreach Discovery** and
**Bloomreach Data Hub** so you can:

1. **Export your catalog to Bloomreach** — scheduled jobs turn your SFCC product
   and content catalog into feeds and deliver them to Bloomreach for indexing.
2. **Serve search & recommendations from Bloomreach** — storefront search,
   category browse, autosuggest, and recommendation widgets are served by
   Bloomreach's APIs instead of the native SFCC search.
3. **Send behavioral events to Bloomreach** — a page-view pixel reports
   storefront activity used by Bloomreach's models.

It is a community-supported, MIT-licensed, open-source tool.

> **Who this is for:** an SFCC B2C merchant (or their implementation partner)
> who has a Bloomreach Discovery and/or Data Hub contract and needs to install,
> configure, and operate this connector. Read top to bottom for a complete
> understanding of what to install, what to configure, and how to run it.

---

## Table of contents

1. [Architecture at a glance](#architecture-at-a-glance)
2. [Repository structure & crucial files](#repository-structure--crucial-files)
3. [Prerequisites](#prerequisites)
4. [Installation](#installation)
5. [Configuration (site preferences & services)](#configuration-site-preferences--services)
6. [Catalog feed delivery (ingestion)](#catalog-feed-delivery-ingestion)
7. [Data Hub delivery for product feeds](#data-hub-delivery-for-product-feeds)
8. [Storefront integration (search, recommendations, pixel)](#storefront-integration-search-recommendations-pixel)
9. [Running & scheduling the jobs](#running--scheduling-the-jobs)
10. [Testing & linting](#testing--linting)
11. [Troubleshooting](#troubleshooting)
12. [Delivery mode comparison](#delivery-mode-comparison)
13. [Contributing & support](#contributing--support)

---

## Architecture at a glance

The connector ships **two cartridges** with distinct roles:

| Cartridge | Role | Runs |
| --- | --- | --- |
| `int_bloomreach` | Backend batch pipeline — builds catalog feeds and delivers them to Bloomreach, tracks async jobs. | SFCC Jobs (scheduled) |
| `int_bloomreach_sfra` | Storefront — replaces native SFRA search/browse with Bloomreach APIs, renders recommendations, fires the behavioral pixel. | Storefront requests (real time) |

```
                       ┌─────────────────────────────────────────┐
   SFCC Catalog ──►    │ int_bloomreach  (SFCC Jobs)              │
   (products/content)  │   export → deliver → (reindex)           │ ──► Bloomreach
                       └─────────────────────────────────────────┘     (Discovery
                                                                          / Data Hub)
                       ┌─────────────────────────────────────────┐
   Shopper ──► Storefront (SFRA)                                   │
                       │ int_bloomreach_sfra                       │ ◄─► Bloomreach
                       │   search / autosuggest / recommendations  │     (Search /
                       │   + page-view pixel                       │      Pathways APIs)
                       └─────────────────────────────────────────┘
```

The two sides are independent: you can ingest without changing the storefront,
and the storefront query path is unaffected by which ingestion mode you choose.

---

## Repository structure & crucial files

### `int_bloomreach` — ingestion pipeline

| Path (under `cartridge/scripts/`) | What it does |
| --- | --- |
| `jobs/blrProductExport.js` | Chunk-oriented job step. Builds the localized **product** feed as JSONL by diffing the catalog against a stored snapshot (full or delta). Owns the snapshot/diff logic. |
| `jobs/blrContentExport.js` | Builds the **content** feed (content assets) as JSONL. |
| `jobs/blrSendFeeds.js` | Delivers generated feed files over HTTP. Product feeds may route to **Data Hub** (see below); content always uses the Catalog Management API. |
| `jobs/blrUploadFeeds.js` | Delivers feed files via **SFTP**, then registers them with the Catalog Management API. Skipped for products in Data Hub mode. |
| `jobs/blrPublishIndex.js` | Polls Bloomreach job status and triggers index publish (Catalog Management flow). |
| `bloomreach/models/product.js`, `models/productAttributes.js` | Map an SFCC `dw.catalog.Product` into Bloomreach's product JSON (`{ op, path, value: { attributes, variants } }`). The internal model shape. |
| `bloomreach/models/decorators/multicurrencyView.js` | Adds per-currency `views` when the `priceAsView` multi-currency strategy is used. |
| `bloomreach/lib/libBloomreach.js` | `getPreference()` — reads `blr_<name>` custom site preferences. Central config accessor. |
| `bloomreach/lib/constants.js` | Feed file paths, prefixes, required-field maps. |
| `bloomreach/helpers/blmHelper.js` | Saves/reads async Bloomreach **job IDs** to the `blm_FeedJobId` custom object. |
| `bloomreach/helpers/dataHubTransform.js` | Isolated transform of the internal model output into the **Data Hub** patch shape. |
| `bloomreach/helpers/dataHubDelivery.js` | Data Hub delivery orchestrator: direct-body vs. file-upload routing, 413 fallback, 429 retry. |
| `bloomreach/services/serviceDefinition.js`, `serviceHelper.js` | Catalog Management API service + request builders. `serviceHelper` also hosts the Data Hub send/status helpers. |
| `bloomreach/services/serviceFileOverHttp.js` | Sends a gzipped feed file over HTTP (Catalog Management). |
| `bloomreach/services/serviceDataHubDefinition.js` | Data Hub Item Collections service (HTTP Basic Auth). |
| `bloomreach/services/serviceDataHubUploadDefinition.js` | PUT service for Data Hub pre-signed upload URLs (large-feed flow). |
| `steptypes.json` | Declares the job **step types** exposed in Business Manager. |

### `int_bloomreach_sfra` — storefront

| Path (under `cartridge/`) | What it does |
| --- | --- |
| `controllers/Search.js` | Replaces SFRA `Search-Show`, `ShowAjax`, `UpdateGrid`, `Content`, `Refinebar` — search & browse served by Bloomreach. |
| `controllers/SearchServices.js` | `GetSuggestions` — autosuggest. |
| `controllers/Bloomreach.js` | `Widget`, `Recommendations` — recommendation/pathways widgets. |
| `models/bloomreach/search.js` (+ `decorators/`) | Maps Bloomreach search responses into the SFRA search model (refinements, sorting, pagination). |
| `scripts/helpers/blrApiSearchHelper.js`, `blrContentSearchHelper.js`, `blrSearchHelpers.js` | Build search/content requests and parse responses. |
| `scripts/services/blrServiceDefinition.js`, `blrServiceHelper.js` | Search / suggest / widgets service calls. |
| `scripts/hooks/pageViewPixel.js` (+ `customizable/pixelDecorators.js`, `blrPageType.js`) | Injects the behavioral pixel via the `app.template.afterFooter` hook. |
| `templates/`, `client/`, `static/` | ISML + client JS for Bloomreach-rendered search results and widgets. |

### Metadata & docs

| Path | What it does |
| --- | --- |
| `metadata/bloomreach.zip` | SFCC site import archive: `services.xml` (service definitions), `jobs.xml` (sample jobs), `meta/system-objecttype-extensions.xml` (all `blr_*` site preferences + the `blm_FeedJobId` custom object). |
| `documentation/` | Integration guides (PDF) and [`DataHub-Delivery.md`](documentation/DataHub-Delivery.md) — deep reference for Data Hub mode. |

---

## Prerequisites

- **Salesforce B2C Commerce** instance with Business Manager access and WebDAV
  credentials for uploading cartridges.
- **SFRA base** — the connector overlays [Storefront Reference Architecture](https://github.com/SalesforceCommerceCloud/storefront-reference-architecture).
  Clone it next to this repo (see `package.json` `paths.base`).
- **Bloomreach contract & credentials:**
  - Discovery: `account_id`, `domain_key` (product catalog), `catalog_name` /
    content domain key (content), an API key, and Search/Suggest/Widget access.
  - SFTP delivery (optional): SFTP host + credentials, and an SFCC **private key**
    in the crypto keystore referenced by `KeyRef('bloomreach')`.
  - Data Hub (optional): `workspace_id`, item-collection name(s), and an API
    **token name + secret** for HTTP Basic Auth.
- **Node.js** and npm for building client assets and running tests.

---

## Installation

```bash
# 1. Clone this repo (and SFRA base alongside it)
git clone <this-repo-url>
git clone https://github.com/SalesforceCommerceCloud/storefront-reference-architecture.git

# 2. Install dev dependencies
npm install

# 3. Confirm the SFRA base path in package.json is correct
#    "paths": { "base": "../storefront-reference-architecture/cartridges/app_storefront_base/" }

# 4. Build client-side assets
npm run compile:js
npm run compile:scss
```

Then, in your SFCC instance:

5. **Upload the cartridges** (`int_bloomreach`, `int_bloomreach_sfra`) via your
   IDE / `npm run uploadCartridge` / build tooling to the active code version.

6. **Add cartridges to the site path.** In *Business Manager >
   Administration > Sites > Manage Sites > (your site) > Settings*, put the
   Bloomreach cartridges **before** the base:

   ```
   int_bloomreach_sfra:int_bloomreach:app_storefront_base
   ```

   `int_bloomreach` must also be resolvable in the **job** execution context.

7. **Import the metadata.** Upload and import `metadata/bloomreach.zip`
   (*Administration > Site Development > Site Import & Export*). This creates:
   - all `blr_*` custom site preferences (group **Bloomreach**),
   - the Bloomreach **services** (`services.xml`),
   - sample **jobs** (`jobs.xml`),
   - the `blm_FeedJobId` custom object type.

8. **Set service credentials** (*Administration > Operations > Services >
   Credentials*) and **site preferences** (next section).

---

## Configuration (site preferences & services)

All preferences live in *Merchant Tools > Site Preferences > Custom Preferences
> **Bloomreach*** and are read in code as `blr_<Name>` via
`libBloomreach.getPreference('<Name>')`.

### Core account & credentials

| Preference (`blr_…`) | Purpose |
| --- | --- |
| `AccountID` | Bloomreach account ID. |
| `DomainKey` | Product catalog domain key. |
| `ContentDomainKey` | Content catalog domain key. |
| `AuthKey` | Catalog Management auth key. |
| `ApiKey` | API key (Bearer auth for Catalog Management API). |
| `sftpUrl`, `sftpPassKey` | SFTP host and passphrase (SFTP delivery). The SFTP **private key** is referenced from the crypto keystore via `KeyRef('bloomreach')`. |

### Feed generation

| Preference (`blr_…`) | Purpose |
| --- | --- |
| `ProductFields` | JSON map of Bloomreach field → SFCC attribute for the product feed. |
| `AdvancedContentExportFields` | JSON map for the content feed. |
| `MiltiLocaleEnabled` | Generate one feed file per allowed locale. |
| `MiltiCurrency` | `disable` / `priceAsAttr` / `priceAsView`. |

### Storefront search

| Preference (`blr_…`) | Purpose |
| --- | --- |
| `SearchEnabled` | Master switch for Bloomreach-served storefront search. |
| `SearchResponseFields`, `ContentSearchResponseFields` | Fields requested from the Search API. |
| `returnProductIDsOnly` | Return only product IDs from search. |
| `StatsFields` | Stats attributes. |
| `enableRelevanceBySegment`, `relevanceBySegmentType` | Segment-based relevance. |

### Data Hub (product feed delivery)

| Preference (`blr_…`) | Purpose |
| --- | --- |
| `ProductFeedDeliveryMode` | `CatalogManagementAPI` (default) or `DataHub`. |
| `DataHubBaseUrl` | e.g. `https://api.bloomreach.com`. |
| `DataHubWorkspaceId` | Data Hub workspace UUID. |
| `DataHubApiTokenName` | Basic Auth username (API token name). |
| `DataHubApiTokenSecret` | Basic Auth password (API token secret). |
| `DataHubItemType` | Item type for products (default `product`). |
| `DataHubCollectionMap` | JSON map of SFCC locale → item-collection, with optional `default`, e.g. `{"default":"catalog","fr_CA":"catalog_fr"}`. |

### Services

Defined in `services.xml`; set credentials in Business Manager after import:

| Service ID | Use |
| --- | --- |
| `bloomreach.http.api` | Catalog Management API (feed delivery, index publish). |
| `bloomreach.http.search.api` | Storefront search. |
| `bloomreach.http.search.suggestions.api` | Autosuggest. |
| `bloomreach.http.widgets.api` | Recommendation/pathways widgets. |
| `bloomreach.http.datahub.api` | Data Hub Item Collections (Basic Auth). |
| `bloomreach.http.datahub.upload.api` | PUT to Data Hub pre-signed upload URLs. |

---

## Catalog feed delivery (ingestion)

The ingestion pipeline runs as SFCC jobs and has two stages: **build** the feed,
then **deliver** it.

1. **Build** — `blrProductExport` (products) / `blrContentExport` (content) write
   JSONL files to the instance temp area. Each line is a Bloomreach patch
   operation (`add` / `remove`). Products are diffed against a stored **snapshot**
   so a run can be a **full feed** (rewrite everything) or a **delta feed** (only
   changes). The snapshot is updated after a successful delivery.
2. **Deliver** — one of:
   - **HTTP (Catalog Management):** `blrSendFeeds` posts the feed to
     `accounts/{AccountID}/catalogs/{DomainKey}/{type}`.
   - **SFTP (Catalog Management):** `blrUploadFeeds` uploads via SFTP, then
     registers the files with the API.
   - **Data Hub:** product feeds only — see the next section.
3. **Track & publish** — the async Bloomreach job ID returned by delivery is
   stored in the `blm_FeedJobId` custom object; `blrPublishIndex` can poll status
   and publish the index (Catalog Management flow).

---

## Data Hub delivery for product feeds

If your contract uses **Bloomreach Data Hub**, product feeds can be delivered to
the **Item Collections API** instead of the Catalog Management API — configured
entirely by site preference, no code changes.

**Scope:** product feeds only. Content feeds always use the Catalog Management
API (Data Hub has no content item collections). The storefront is unaffected.

### Enable it

Set `ProductFeedDeliveryMode = DataHub` and populate the Data Hub preferences in
the [configuration table above](#data-hub-product-feed-delivery). Then run your
existing product feed job as usual.

The delivery target is:

```
POST {DataHubBaseUrl}/api/cde/v1/workspaces/{DataHubWorkspaceId}
     /item-collections/{collection}/item-types/{DataHubItemType}
     /records?update_mode={full|delta}
```

with HTTP Basic Auth (`DataHubApiTokenName` : `DataHubApiTokenSecret`).
`update_mode` mirrors your existing full (PUT) / delta (PATCH) distinction.

### How records are shaped

The internal product model is reused unchanged; only the wire shape is adapted
(in `dataHubTransform.js`):

| Internal model | Data Hub |
| --- | --- |
| `path: "/products/{id}"` | `path: "/{id}"` |
| `value.attributes` (product & variant) | `value.fields` |
| `{op:"remove", data:"products/{id}"}` | `{op:"remove", path:"/{id}"}` |

### Delivery routing (small vs. large feeds)

Direct submission has body-size limits. Routing (in `dataHubDelivery.js`) follows
Bloomreach guidance:

- **Full feed** → **file-upload-with-reference** flow: request a pre-signed URL
  (`/upload-urls`), `PUT` the gzipped JSONL file, then submit a records call that
  references the uploaded file. Handles very large catalogs.
- **Delta feed** → direct `application/json-patch+jsonlines` body; if the server
  returns **413 (too large)**, it automatically falls back to the file-upload flow.

### Async jobs, errors, retries

- A successful call returns **202** with a job reference (`data.id`), stored via
  `blmHelper.saveIdToCustomObj`. Status can be polled at
  `GET /api/cde/v1/workspaces/{workspaceId}/jobs/{jobId}` (helper provided).
- Error responses (`400/404/413/415/429/500`) are parsed as Bloomreach's
  structured error body and logged with title/detail/context.
- **429** is retried using the server-provided `retry_after_seconds`.

### Constraints

- **One item collection per locale.** Map each locale in `DataHubCollectionMap`;
  otherwise locales would overwrite one another. The job fails with a clear error
  if a locale has no mapping.
- **Multi-currency:** use `priceAsAttr`. `priceAsView` is **not supported** in
  Data Hub mode (Item Collections has no `views` concept) and the feed job stops
  with an error if it is set.
- **No SFTP** in Data Hub mode; the SFTP step is skipped for products.

Full details, request/response examples, and open assumptions:
[`documentation/DataHub-Delivery.md`](documentation/DataHub-Delivery.md).

---

## Storefront integration (search, recommendations, pixel)

When `int_bloomreach_sfra` is in the cartridge path and `SearchEnabled` is on:

- **Search & browse** — `Search-Show`, `Search-ShowAjax`, `Search-UpdateGrid`,
  `Search-Content`, and `Search-Refinebar` are served by Bloomreach's Search API,
  mapped back into the SFRA search model (refinements, sort, pagination) so
  existing search templates keep working.
- **Autosuggest** — `SearchServices-GetSuggestions` calls the Suggest API.
- **Recommendations** — `Bloomreach-Widget` and `Bloomreach-Recommendations`
  render pathways/recommendation widgets.
- **Behavioral pixel** — injected site-wide via the `app.template.afterFooter`
  hook (`pageViewPixel.js`), reporting page/search/product events to Bloomreach.

No storefront template changes are required to switch ingestion mode; the query
path always uses `domain_key` (product) / `catalog_name` (content).

---

## Running & scheduling the jobs

`metadata/bloomreach.zip` imports sample jobs (*Administration > Operations >
Jobs*). Typical setup:

| Job | Steps | When |
| --- | --- | --- |
| **Bloomreach Product Feed** | Product export (FullFeed) → deliver | Periodic full refresh (e.g. nightly). |
| **Bloomreach Delta Product Feed** | Product export (DeltaFeed) → deliver | Frequent incremental updates. |
| **Bloomreach Content Feed** | Content export → deliver (SFTP) | Content refresh. |
| **Bloomreach Publish Index** | Poll status → publish | Catalog Management flow. |

Each step has an **Enabled** flag and a **FeedType** (Product/Content). Delivery
steps also take an **UpdateType** (PUT = full, PATCH = delta) which maps to Data
Hub `update_mode`. Assign each job the correct site context and schedule.

To operate in **Data Hub** mode: keep the same export step, set
`ProductFeedDeliveryMode = DataHub`, and the delivery step routes to Data Hub
automatically. The SFTP upload step becomes a no-op for products.

---

## Testing & linting

```bash
npm run test              # unit tests (mocha)
npm run test:integration  # integration tests (needs dw.json + Site ID in it.config.js)
npm run lint              # eslint + stylelint
```

Unit tests for the Data Hub delivery path live under
`test/unit/int_bloomreach/` (transform shape, request construction, error
parsing, and the file-upload flow with 413 fallback / 429 retry).

---

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| Product feed job fails immediately with a `priceAsView` error | Data Hub mode does not support `priceAsView`. Set `blr_MiltiCurrency = priceAsAttr`. |
| Data Hub job fails: "No item-collection mapped for locale …" | Add the locale (or a `default`) to `blr_DataHubCollectionMap`. |
| `401/403` from Data Hub | Check `DataHubApiTokenName` / `DataHubApiTokenSecret` and that the token has records-update permission. |
| `413` on delta | Expected for very large deltas — the connector auto-falls back to the file-upload flow. Persistent 413 after fallback means the feed exceeds limits; split it. |
| `429` repeated | Rate limited; the connector waits `retry_after_seconds` and retries up to a cap. Reduce feed frequency if it persists. |
| Storefront search still native | Confirm `int_bloomreach_sfra` precedes `app_storefront_base` in the cartridge path and `blr_SearchEnabled` is on. |
| Delta sends full products every run | Expected — a changed product is sent as a full record; the snapshot drives which products are included. |

---

## Delivery mode comparison

| | Catalog Management API (default) | Data Hub Item Collections |
| --- | --- | --- |
| Scope | Product **and** content | **Product only** |
| Auth | Bearer API key / SFTP key | HTTP Basic (token name/secret) |
| Transport | HTTP or SFTP | HTTPS (direct body or pre-signed upload URL) |
| Target | `catalogs/{DomainKey}` | `workspaces/{id}/item-collections/{collection}` |
| Enable | Default | `blr_ProductFeedDeliveryMode = DataHub` |
| Large feeds | SFTP file | Pre-signed upload URL (up to 100 GB/file) |

---

## Contributing & support

The Bloomreach Salesforce connector is a community-supported, open-source tool.
Submit a pull request for the team to review. See [`CHANGELOG.md`](CHANGELOG.md)
for version history and `documentation/` for the full integration guides.
