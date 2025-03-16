const { Constants } = require('../../utils/constants');
const { sleep } = require('../../utils/helpers');
const getLogger = require('../../utils/logger');
const { Sites } = require('../../utils/constants');



const Helper = require('./helper');

const logger = getLogger('sn');  




const scrape = async (config) => {
    try {
        const getDate = Helper.createDateIterator(config.sinceDate);

        let gotScraping;
        gotScraping ??= (await import('got-scraping')).gotScraping;

     


        do {
            logger.info(`Running sice date: ${getDate()}`);
            await sleep(config.delay);
        } while (getDate() !== null);

        

     


    } catch (error) {
        logger.error(`Error in scraper: ${error.message}`);
    }
};


async function scraper(config) {
    await config.database.initialize();

    const tasks = [];

    if (config.useDataParser) {
        console.log('Running data parser');
        tasks.push(config.dataParser.parse(config.database));
    }
    
    if (config.models[Sites.sad_najwyzszy] && config.models[Sites.sad_najwyzszy].enabled) {
        logger.info('Running model:', Sites.sad_najwyzszy);
        tasks.push(scrape(config));
    }

    await Promise.all(tasks);
    
    await config.database.close();
}

module.exports = {
    scraper,
};