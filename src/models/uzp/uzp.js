const { Constants } = require('../../utils/constants');
const { sleep } = require('../../utils/helpers');
const getLogger = require('../../utils/logger');



const Helper = require('./helper');

const logger = getLogger('uzp');  




const getIFrameContent = async (url, config, gotScraping) => {
    try {
        let {body, statusCode} = await gotScraping.get({
            url,			
            headers: {
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'accept-language': 'en-US,en;q=0.9,pl;q=0.8',
                'cache-control': 'no-cache',
                'pragma': 'no-cache',
                'priority': 'u=0, i',
                'sec-ch-ua': Constants.NEWEST_CHROME_SEC_CH_UA,
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'document',
                'sec-fetch-mode': 'navigate',
                'sec-fetch-site': 'none',
                'sec-fetch-user': '?1',
                'upgrade-insecure-requests': '1',
                'user-agent': Constants.NEWEST_CHROME_USER_AGENT,
            },
            followRedirect: false,
            cookieJar: config.cookieJar,
            throwHttpErrors: false,
            proxyUrl: config?.proxyManager
                ? config.proxies.rotate === 'random'
                    ? config.proxyManager.getRandomProxy()
                    : config.proxyManager.getNextProxy()
                : undefined,        
            timeout: {
                request: config.timeout,
            },
        });
        if (statusCode !== 200) {
            return { status: statusCode, results: null };
        }
        const iFrameResults = await Helper.getDecisionAndResultDivs(body); 
        return { status: statusCode, results: iFrameResults };
    } catch (error) {
        throw new Error(`getIFrameContent: ${error.message}`);
    }
};



const scrape = async (config) => {
    try {
        let gotScraping;
        gotScraping ??= (await import('got-scraping')).gotScraping;

     
        let largestId = await config.database.getLargestId('scraped_data');
        logger.info(`Found largest id: ${largestId}, starting with ${largestId + 1}`);
        await sleep(config.delay);


        for (let index = 1; index < config.scrapLength + 1; index++) {
            let retryCount = 0;
            let nextIndex = largestId + index;
            
            do {
                try {
                    let { body, statusCode } = await gotScraping.get({
                        url:`https://orzeczenia.uzp.gov.pl/Home/Details/${nextIndex}`,			
                        headers: {
                            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                            'accept-language': 'en-US,en;q=0.9,pl;q=0.8',
                            'cache-control': 'no-cache',
                            'pragma': 'no-cache',
                            'priority': 'u=0, i',
                            'sec-ch-ua': Constants.NEWEST_CHROME_SEC_CH_UA,
                            'sec-ch-ua-mobile': '?0',
                            'sec-ch-ua-platform': '"Windows"',
                            'sec-fetch-dest': 'document',
                            'sec-fetch-mode': 'navigate',
                            'sec-fetch-site': 'none',
                            'sec-fetch-user': '?1',
                            'upgrade-insecure-requests': '1',
                            'user-agent': Constants.NEWEST_CHROME_USER_AGENT,
                        },
                        followRedirect: false,
                        cookieJar: config.cookieJar,
                        throwHttpErrors: false,
                        proxyUrl: config?.proxyManager
                            ? config.proxies.rotate === 'random'
                                ? config.proxyManager.getRandomProxy()
                                : config.proxyManager.getNextProxy()
                            : undefined,        
                        timeout: {
                            request: config.timeout,
                        },
                    });
                    if (statusCode == 200) {
                        const {detailsMetrics, iFrame, title} = await Helper.getDetailsMetricsDivAndIframe(body); 
                        await sleep(config.delay);
                        const {status, results} = await getIFrameContent(iFrame, config, gotScraping);
                        if (status !== 200) {
                            throw new Error(`bad statusCode in iFrame scraping: ${status}`);
                        }
                        const data = {
                            page_html: body,
                            iframe_html: results.wholeHtml,
                            judgment_div: results.judgementDiv,
                            decision_div: results.decisionDiv,
                            details_metrics: detailsMetrics,
                            title,
                            status_code: statusCode,
                            index: nextIndex,
                            url: `https://orzeczenia.uzp.gov.pl/Home/Details/${nextIndex}`,
                        };
            
                        await config.database.insertData('scraped_data', data);
                    } else if (statusCode == 404) {
                        const data = {
                            status_code: statusCode,
                            index: nextIndex,
                            url: `https://orzeczenia.uzp.gov.pl/Home/Details/${nextIndex}`,
                        };
                        await config.database.insertData('scraped_data', data);
                        logger.warn(`Page does not exist: ${statusCode}, url: https://orzeczenia.uzp.gov.pl/Home/Details/${nextIndex}`);
                    } else {
                        throw new Error(`bad status code: ${statusCode}, url: https://orzeczenia.uzp.gov.pl/Home/Details/${nextIndex}`);                  
                    }
                    await sleep(config.delay);
                    retryCount = config.maxRetries;
                } catch (error) {
                    logger.error(`Found error scraping uzp: ${error.message}, index: ${nextIndex}`);
                    if (config.abortOnFailure) {
                        return;
                    }
                    retryCount++;
                    await sleep(config.retryDelay);
                }
            } while (retryCount < config.maxRetries);      
   
          
        }

     


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
    
    if (config.models['uzp'] && config.models['uzp'].enabled) {
        logger.info('Running model: uzp');
        tasks.push(scrape(config));
    }

    await Promise.all(tasks);
    
    await config.database.close();
}

module.exports = {
    scraper,
};