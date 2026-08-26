'use strict';

/**
 * Orchestrates delivery of a product feed file to the Bloomreach Data Hub Item
 * Collections API. Routing (per Bloomreach guidance):
 *   - update_mode = full  -> file-upload-with-reference flow (large periodic refresh)
 *   - update_mode = delta -> direct JSONLines body; on HTTP 413 fall back to the
 *                            file-upload flow automatically (the 413 context tells
 *                            us the payload exceeded the direct-body limit)
 * Rate limiting (HTTP 429) is retried using context.retry_after_seconds.
 *
 * All I/O is injected via `deps` so this module is pure orchestration and fully
 * unit-testable without SFCC APIs. blrSendFeeds.js wires the real implementations.
 *
 * deps: {
 *   transformFeedFile(srcFile, destFile),      // internal shape -> Data Hub shape
 *   makeFile(pathString) -> file,
 *   gzipFile(file) -> gzFile,                   // gzip; returns .gz file
 *   sendRecords(file, updateMode, collection) -> Result,       // direct JSONLines body
 *   getUploadUrls(filePaths) -> Result,         // { data: [{ file_path, url }] }
 *   uploadFile(url, file) -> Result,            // PUT to pre-signed URL
 *   sendFileReference(filePaths, updateMode, collection) -> Result,
 *   parseError(text) -> { status, title, detail, context },
 *   waitSeconds(seconds),
 *   logger: { info, warn, error },
 *   maxRetries: int
 * }
 * A Result is dw.svc.Result-like: { ok, error, errorMessage, object }.
 */

/**
 * Extract the async job id from a successful (202) records response.
 * @param {Object} result - service Result
 * @returns {string|null} - job id
 */
function jobIdOf(result) {
    return (result && result.object && result.object.data) ? result.object.data.id : null;
}

/**
 * Extract a raw error body string from a failed Result for error parsing.
 * @param {Object} result - service Result
 * @returns {string} - body text
 */
function errorTextOf(result) {
    if (result && result.object && typeof result.object.text === 'string') {
        return result.object.text;
    }
    return (result && result.errorMessage) ? result.errorMessage : '';
}

/**
 * Determine the HTTP status of a failed Result, preferring the parsed error body.
 * @param {Object} result - service Result
 * @param {Object} parsed - parsed error
 * @returns {number} - HTTP status code
 */
function statusOf(result, parsed) {
    if (parsed && parsed.status) { return parsed.status; }
    return (result && result.error) ? result.error : 0;
}

module.exports.deliverProductFeed = function (params) {
    var updateMode = params.updateMode;       // 'full' | 'delta'
    var collectionName = params.collectionName;
    var srcFile = params.srcFile;
    var deps = params.deps;
    var maxRetries = typeof deps.maxRetries === 'number' ? deps.maxRetries : 3;

    // 1. Transform internal-shape JSONLines into Data Hub patch shape.
    var dhFile = deps.makeFile(srcFile.getFullPath() + '.datahub.jsonl');
    deps.transformFeedFile(srcFile, dhFile);

    var createdGz = null;

    /**
     * Call a send function, retrying on 429 using retry_after_seconds.
     * @param {Function} sendFn - returns a Result
     * @returns {Object} - { ok, jobId, httpStatus, error }
     */
    function attemptSend(sendFn) {
        var attempt = 0;
        for (;;) {
            var res = sendFn();
            if (res && res.isOk && res.isOk()) {
                return { ok: true, jobId: jobIdOf(res) };
            }
            var parsed = deps.parseError(errorTextOf(res));
            var status = statusOf(res, parsed);
            deps.logger.error('Data Hub error: status={0} title={1} detail={2} context={3}',
                status, parsed.title || '', parsed.detail || '',
                parsed.context ? JSON.stringify(parsed.context) : '');

            if (status === 429 && attempt < maxRetries) {
                var retryAfter = (parsed.context && parsed.context.retry_after_seconds)
                    ? parsed.context.retry_after_seconds : 1;
                deps.logger.info('Data Hub rate limited (429); waiting {0}s before retry {1}/{2}',
                    retryAfter, attempt + 1, maxRetries);
                deps.waitSeconds(retryAfter);
                attempt += 1;
            } else {
                return { ok: false, httpStatus: status, error: parsed };
            }
        }
    }

    /**
     * File-upload-with-reference flow: gzip -> get upload url -> PUT -> reference.
     * @returns {Object} - outcome
     */
    function fileUploadFlow() {
        if (!createdGz) {
            createdGz = deps.gzipFile(dhFile);
        }
        var fileName = createdGz.getName();

        var urlsRes = deps.getUploadUrls([fileName]);
        if (!(urlsRes && urlsRes.isOk && urlsRes.isOk())) {
            var uErr = deps.parseError(errorTextOf(urlsRes));
            deps.logger.error('Data Hub get-upload-urls failed: status={0} detail={1}',
                statusOf(urlsRes, uErr), uErr.detail || '');
            return { ok: false, httpStatus: statusOf(urlsRes, uErr), error: uErr };
        }

        var entry = (urlsRes.object && urlsRes.object.data && urlsRes.object.data[0])
            ? urlsRes.object.data[0] : null;
        if (!entry || !entry.url) {
            deps.logger.error('Data Hub upload-urls response missing url');
            return { ok: false, httpStatus: 0, error: { detail: 'missing upload url' } };
        }

        var putRes = deps.uploadFile(entry.url, createdGz);
        if (!(putRes && putRes.isOk && putRes.isOk())) {
            deps.logger.error('Data Hub file upload (PUT) failed: status={0}',
                (putRes && putRes.error) ? putRes.error : 0);
            return { ok: false, httpStatus: (putRes && putRes.error) ? putRes.error : 0, error: {} };
        }

        var referencePath = entry.file_path || fileName;
        return attemptSend(function () {
            return deps.sendFileReference([referencePath], updateMode, collectionName);
        });
    }

    var outcome;
    try {
        if (updateMode === 'full') {
            outcome = fileUploadFlow();
        } else {
            outcome = attemptSend(function () {
                return deps.sendRecords(dhFile, updateMode, collectionName);
            });
            if (!outcome.ok && outcome.httpStatus === 413) {
                deps.logger.info('Delta payload exceeded direct-body limit (413); '
                    + 'falling back to file-upload-with-reference flow.');
                outcome = fileUploadFlow();
            }
        }
    } finally {
        if (dhFile.exists && dhFile.exists()) { dhFile.remove(); }
        if (createdGz && createdGz.exists && createdGz.exists()) { createdGz.remove(); }
    }

    return outcome;
};
