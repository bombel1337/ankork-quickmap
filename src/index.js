const fs = require('fs');
const path = require('path');

const config = require('./scraper.config');
const log4js = require('log4js');
const logger = log4js.getLogger('index');

const modelsDir = path.join(__dirname, 'models');

let modelFolders = [];
try {
    modelFolders = fs.readdirSync(modelsDir).filter(item => {
        const itemPath = path.join(modelsDir, item);
        return fs.statSync(itemPath).isDirectory();
    });
} catch (err) {
    logger.error(`Error reading models directory: ${err.message}`);
}

const run = {};

modelFolders.forEach(folder => {
    const jsFilePath = path.join(modelsDir, folder, `${folder}.js`);
    if (fs.existsSync(jsFilePath)) {
        run[folder] = () => {
            if (config.models[folder]) {
                if (!config.models[folder].enabled && !config.models[folder].useDataParser) {
                    logger.warn(`Model "${folder}" is disabled in configuration`);
                    return;
                }
                // Create a merged config for this specific model
                const modelConfig = {
                    ...config,
                    ...config.models[folder],
                    currentModel: folder
                };
                
                const modelModule = require(jsFilePath);
                if (typeof modelModule.scraper === 'function') {
                    modelModule.scraper(modelConfig);
                } else {
                    logger.warn(`No scraper function found in module: ${jsFilePath}`);
                }
            } else {
                logger.warn(`Model "${folder}" does not exist in configuration`);
            }
        };
    } else {
        logger.warn(`Expected file not found: ${jsFilePath}`);
    }
});

const selectedSite = process.argv[2];

if (selectedSite) {
    if (run[selectedSite]) {
        run[selectedSite]();
    } else {
        logger.warn(`No runner function found for site "${selectedSite}"`);
    }
} else {
    // Run all enabled models
    Object.keys(run).forEach(siteKey => {
        if (config.models[siteKey] && config.models[siteKey].enabled) {
            logger.log(`Running scraper for site: ${siteKey}`);
            run[siteKey]();
        }
    });
}