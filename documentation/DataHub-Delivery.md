# Product Feed Delivery via Bloomreach Data Hub (Item Collections API)

This connector can deliver **product feeds** either via the legacy Catalog
Management API (SFTP / direct HTTP) or via the Bloomreach **Data Hub Item
Collections API**. The path is selected per site by a site preference; the
default preserves existing behavior byte-for-byte.

> **Scope:** Product feeds only. **Content feeds always** use the Catalog
> Management API — Data Hub does not support content item collections. The
> storefront (`int_bloomreach_sfra`) is unaffected; this is an ingestion-side
> change only.

## Delivery mode

`blr_ProductFeedDeliveryMode` (enum):

| Value | Behavior |
| --- | --- |
| `CatalogManagementAPI` *(default)* | Existing SFTP/HTTP delivery to the Catalog Management API. No change. |
| `DataHub` | Product feeds delivered to the Data Hub Item Collections API. |

When unset or `CatalogManagementAPI`, behavior is identical to previous releases.

## Site preferences (all `blr_*`, per-Site)

| Preference | Purpose |
| --- | --- |
| `blr_ProductFeedDeliveryMode` | `CatalogManagementAPI` (default) or `DataHub`. |
| `blr_DataHubBaseUrl` | Data Hub API base URL, e.g. `https://api.bloomreach.com`. |
| `blr_DataHubWorkspaceId` | Data Hub workspace UUID. |
| `blr_DataHubApiTokenName` | Basic Auth username (API token name). |
| `blr_DataHubApiTokenSecret` | Basic Auth password (API token secret). |
| `blr_DataHubItemType` | Item type for product records. Default `product`. |
| `blr_DataHubCollectionMap` | JSON map of SFCC locale → item-collection name, with optional `default` key. |

`blr_DataHubCollectionMap` example:

```json
{ "default": "catalog", "fr_CA": "catalog_fr" }
```

An **explicit** locale → collection map is used (rather than any derived/
suffixed naming) because Data Hub records have no locale dimension: each locale
must be delivered to its own collection or its records would overwrite another
locale's on every run. If a feed file's locale resolves to no collection (no
matching key and no `default`), the delivery step fails with `Status.ERROR`
rather than sending data to the wrong place.

### Credential handling

The API token name/secret are stored as standard protected custom preferences,
matching how `blr_sftpPassKey` is handled today. `dw.crypto.KeyRef` is **not**
used here — that mechanism is specific to the SFTP private key in the crypto
keystore and does not apply to an HTTP Basic Auth token pair.

## What happens in Data Hub mode

- **`blrSendFeeds` (product):** each generated JSONL feed file is transformed to
  the Data Hub patch shape, then delivered by delivery mode (see routing below).
  The records endpoint is
  `{baseUrl}/api/cde/v1/workspaces/{workspaceId}/item-collections/{collection}/item-types/{itemType}/records?update_mode={full|delta}`
  with HTTP Basic Auth. `update_mode` mirrors the existing PUT (full) / PATCH
  (delta) distinction. The 202 response's job id (`data.id`) is stored via the
  existing `blmHelper.saveIdToCustomObj` pattern.
- **`blrUploadFeeds` (product):** skipped with a log message — Data Hub is
  HTTP-only and has no SFTP ingestion path.
- **Snapshot / delta diffing** in `blrProductExport` is unchanged.

### Delivery routing (direct body vs. file upload)

Direct submission has body-size limits (Bloomreach: ~5 MB Direct JSON, ~100 MB
Direct JSONLines). Routing follows Bloomreach's own guidance:

- **`full` (FullFeed / PUT):** always uses the **file-upload-with-reference**
  flow — recommended for large periodic refreshes.
- **`delta` (PATCH):** direct `application/json-patch+jsonlines` body. If the
  server answers **413**, it automatically falls back to the file-upload flow.

File-upload-with-reference flow (three steps, all under the workspace API):

1. `POST {baseUrl}/api/cde/v1/workspaces/{workspaceId}/upload-urls` with
   `{"file_paths":["<name>.jsonl.gz"]}` → returns a pre-signed HTTPS URL per path.
2. `PUT` the gzipped feed file to the returned URL (Data Hub auto-decompresses
   `.gz`; up to 100 GB/file).
3. `POST` the records endpoint with `{"file_paths":["<name>.jsonl.gz"]}` and
   `Content-Type: application/json` (`update_mode` as above).

### Error handling

Non-2xx responses are parsed as Data Hub's RFC-7807-style body
(`{ title, type, status, detail, context }`) and logged with `title`/`detail`/
`context` — not just the status code. Handled: 400, 404, 413, 415, 429, 500.

- **429:** retried using `context.retry_after_seconds` from the response (up to a
  small retry cap). SFCC job scripts have no non-blocking sleep, so the wait is a
  bounded busy-wait — kept short deliberately.
- **413:** the response's `context.max_payload_size_bytes` /
  `context.payload_size_bytes` are logged; for delta this triggers the automatic
  file-upload fallback. No payload-size limit is hardcoded anywhere — the actual
  max is read from the error response at runtime.

### Multi-currency constraint

Under Data Hub mode, **`priceAsView` is not supported** — the Item Collections
record schema has no "views" concept, so `value.views` cannot be represented.
`blrProductExport.beforeStep()` fails the job immediately if
`blr_ProductFeedDeliveryMode = DataHub` and `blr_MiltiCurrency = priceAsView`.
**`priceAsAttr` is the supported strategy** — its flat `price_<currency>` fields
map cleanly onto `fields`.

## Payload transform

`scripts/bloomreach/helpers/dataHubTransform.js` (`toDataHubPatchRecord`) is the
single, isolated transform from the internal model shape to the Data Hub shape.
Only two structural details change; attribute names/values are untouched:

| | Internal model | Data Hub |
| --- | --- | --- |
| path | `/products/{id}` | `/{id}` |
| field key | `value.attributes` (product + variant) | `value.fields` (product + variant) |
| remove | `{op:'remove', data:'products/{id}'}` | `{op:'remove', path:'/{id}'}` |

## Assumptions (confirm with the Bloomreach Data Hub team before customer rollout)

- **Job polling — parity with today, no action:** the existing Catalog Management
  flow also does not poll job status automatically (it saves the job id via
  `blmHelper` and stops). `getDataHubJobStatus` is provided but unwired — exact
  parity, not a regression. Wiring a polling step is a possible follow-up
  (`GET /api/cde/v1/workspaces/{workspaceId}/jobs/{jobId}`). `blrPublishIndex`
  still targets the legacy API and is out of scope.
- **SFTP ingestion — assumption:** no SFTP ingestion path appears in Data Hub's
  Item Collections documentation; everything is HTTP to the workspace endpoint.
  The SFTP step is skipped for products on that basis. This is an assumption
  pending explicit confirmation from Bloomreach's Data Hub team, not a settled
  fact.
- **Signed-URL PUT headers:** the file is PUT to the pre-signed URL without extra
  headers. If Bloomreach signs the URL with a required `Content-Type`, that header
  may need to be added to match the signature — verify against a live upload URL.
