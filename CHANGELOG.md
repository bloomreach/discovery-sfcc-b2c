# Changelog

All notable changes to this connector are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [2.0.0] - 2026-08-26 — Data Hub delivery fixes

Correctness fixes for product feed delivery via the Bloomreach Data Hub Item
Collections API (`ProductFeedDeliveryMode = DataHub`).

### Fixed

- **Full Feed job now actually delivers to Data Hub.** The Full Feed job was
  missing a `Send feed to API` step, so in Data Hub mode it generated the feed
  file and then delivered it nowhere (the SFTP upload step correctly no-ops for
  products under Data Hub). Added the `Send feed to API` step (`FeedType = Product`,
  `UpdateType = PUT`) to the shipped job. Existing customer job configurations must
  add this step manually.
- **Delta feeds no longer break for unchanged locales on multi-locale sites.** When
  a product changed in only one locale, the export wrote a malformed (`undefined`)
  line into every *other* locale's delta feed file. Under Data Hub that malformed
  line failed transform/parse and broke the untouched locale's feed. The export now
  writes a line only for locales that actually changed. This was the likely root
  cause of "delta feeds aren't picking up product/variant changes."
- **Product delivery no longer silently breaks for legacy SFTP sites.** Kept the
  SFTP-skip guard gated on `ProductFeedDeliveryMode` (rather than unconditionally
  skipping SFTP for all product feeds), so sites on the legacy Catalog-Management-
  via-SFTP path continue to deliver. Documented in-code so it is not "fixed"
  incorrectly again.
- **Job-status tracking is now Data Hub-aware.** Stored feed job ids now record
  which API they came from (`catalog` vs `datahub`), and the Publish Index job polls
  the correct status endpoint per job and cleans up its tracking custom object on a
  terminal Data Hub state. Previously every Data Hub job id was polled against the
  Catalog Management endpoint (always failing) and its custom object accumulated
  forever.

### Added

- Fail-fast validation: the product feed job now stops at start with a clear,
  specific error when Data Hub mode is enabled but required preferences
  (`blr_DataHubBaseUrl`, `blr_DataHubWorkspaceId`, `blr_DataHubApiTokenName`,
  `blr_DataHubApiTokenSecret`) are empty, instead of failing with an opaque HTTP
  error deep inside delivery.
- `source` attribute on the `blm_FeedJobId` custom object to distinguish Catalog
  Management job ids from Data Hub job ids.

### Notes

- **Open item (needs Bloomreach input):** whether the legacy `publishIndex()` call
  should run at all for Data Hub-delivered collections is still unresolved. This
  release makes status tracking and cleanup correct but does not change whether that
  final publish call fires in Data Hub mode.
