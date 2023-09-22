'use strict';

const Logger = require('dw/system/Logger').getLogger('Bloomreach', 'blrContentExport.js');
const Calendar = require('dw/util/Calendar');
const StringUtils = require('dw/util/StringUtils');
const Site = require('dw/system/Site');
const File = require('dw/io/File');
const FileWriter = require('dw/io/FileWriter');
const ContentMgr = require('dw/content/ContentMgr');
const URLUtils = require('dw/web/URLUtils');
const Status = require('dw/system/Status');

/**
 * Returns all searchable content assets
 * @returns {string} the status results
 */
function getAllSearchableContentAssets() {
    var rootFolder = ContentMgr.getFolder('root');
    var contentIDs = [];

    var processFolder = function (currentFolder) {
        var contents = currentFolder.getContent().toArray();
        var subFolders = currentFolder.getSubFolders().toArray();

        contents.forEach(function (content) {
            var isSearchable = (content.online && content.searchable);
            if (isSearchable && contentIDs.indexOf(content) === -1) {
                contentIDs.push(content);
            }
        });

        subFolders.forEach(function (subFolder) {
            processFolder(subFolder);
        });
    };

    processFolder(rootFolder);

    return contentIDs;
}

/**
 * Generate Bloomreach content object
 * @param {dw.content.Content} content content asset
 * @param {string} event Bloomreach event type
 * @param {Object} config fields for feed generation
 * @returns {Object} Bloomreach content object
 */
function getBloomreachContentObject(content, event, config) {
    var attributes = {};
    for (var prop in config) { // eslint-disable-line no-restricted-syntax
        if (prop === 'url') {
            attributes[prop] = URLUtils.abs('Page-Show', 'cid', content.ID).toString();
        } else {
            var params = config[prop].split('.');
            for (var i = 0; i < params.length; i++) {
                attributes[prop] = attributes[prop] ? attributes[prop][params[i]] : content[params[i]];
            }
        }
    }

    return {
        op: event,
        path: '/items/' + content.ID,
        value: {
            attributes: attributes
        }
    };
}

/**
 * Returns a status of okay
 * @param {Object} parameters - object of site parameters
 * @returns {string} the status results
 */
function execute(parameters) {
    var enabled = parameters.Enabled;
    if (!enabled) {
        Logger.info('Content feed generate step is not enabled, skipping...');
        return new Status(Status.OK);
    }

    var libBloomreach = require('*/cartridge/scripts/bloomreach/lib/libBloomreach');
    var isMultiLocale = libBloomreach.getPreference('MiltiLocaleEnabled');
    var { CONTENT_FEED_LOCAL_PATH, CONTENT_FEED_PREFIX } = require('*/cartridge/scripts/bloomreach/lib/constants');
    var advancedContentExportFields = libBloomreach.getPreference('AdvancedContentExportFields');
    var file;
    var fileWriter;
    var contentFields;
    var currentSites;
    var siteLocales;
    var siteLocalesSize;
    var currenrLocale;
    var fileStorage = [];

    try {
        contentFields = advancedContentExportFields ? JSON.parse(advancedContentExportFields) : {};
    } catch (error) {
        contentFields = {};
    }

    currentSites = Site.getCurrent();
    currenrLocale = request.getLocale();
    if (isMultiLocale) {
        siteLocales = currentSites.getAllowedLocales();
        siteLocalesSize = siteLocales.size();
    } else {
        siteLocales = [currenrLocale];
        siteLocalesSize = siteLocales.length;
    }

    // create file name
    var cal = new Calendar();
    var stamp = StringUtils.formatCalendar(cal, 'yyyyMMddhhmmss');
    var sid = Site.current.ID;

    try {
        // create folder at the local storage
        var filepath = [File.TEMP, CONTENT_FEED_LOCAL_PATH].join(File.SEPARATOR);
        var filepathFile = new File(filepath);
        filepathFile.mkdirs();

        // remove old content feed files
        var fileregex = new RegExp('^' + CONTENT_FEED_PREFIX + '_' + sid + '_\\d{14}.*?\\.jsonl$');
        filepathFile.listFiles(function (f) {
            if (fileregex.test(f.name)) {
                f.remove();
            }
            return false;
        });

        for (var i = 0; i < siteLocalesSize; i++) {
            var localeName = siteLocales[i];
            // create file writer
            var filename = CONTENT_FEED_PREFIX + '_' + sid + '_' + stamp + (isMultiLocale ? ('_' + localeName) : '') + '.jsonl';
            file = new File(filepathFile, filename);
            fileWriter = new FileWriter(file);
            var localData = {
                localeName: localeName,
                filename: filename,
                file: file,
                fileWriter: fileWriter
            };
            fileWriter.setLineSeparator('\n');
            fileStorage.push(localData);

            request.setLocale(localeName);
            var contents = getAllSearchableContentAssets();
            contents.forEach(function (content) { // eslint-disable-line no-loop-func
                var blmObject = getBloomreachContentObject(content, 'add', contentFields);
                fileWriter.writeLine(JSON.stringify(blmObject));
            });
        }
    } catch (error) {
        Logger.error('Can\'t create Content Feed file! ' + error);
        return new Status(Status.ERROR);
    } finally {
        fileStorage.forEach(function (item) {
            item.fileWriter.close();
            if (item.file.length() === 0) {
                item.file.remove();
            }
        });
        request.setLocale(currenrLocale);
    }
    return new Status(Status.OK);
}

module.exports.execute = execute;
