const { Constants } = require('../../utils/constants');
const { sleep } = require('../../utils/helpers');
const getLogger = require('../../utils/logger');
const { Sites } = require('../../utils/constants');



const Helper = require('./helper');

const logger = getLogger('sn');  


const getDetails = async (url, config, gotScraping, proxyUrl = undefined) => {
    try {
        let {body, statusCode} = await gotScraping.get({
            url,			
            headers: {
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'accept-language': 'en-US,en;q=0.9,pl;q=0.8',
                'cache-control': 'no-cache',
                'pragma': 'no-cache',
                'priority': 'u=0, i',
                'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'document',
                'sec-fetch-mode': 'navigate',
                'sec-fetch-site': 'none',
                'sec-fetch-user': '?1',
                'upgrade-insecure-requests': '1',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',              
            },
            followRedirect: false,
            cookieJar: config.cookieJar,
            throwHttpErrors: false,
            proxyUrl,        
            timeout: {
                request: config.timeout,
            },
        });
        if (statusCode !== 200) {
            return { status: statusCode, body: null };
        }
        return { status: statusCode, body };
    } catch (error) {
        throw new Error(`getDetails: ${error.message}`);
    }
};

const scrape = async (config) => {
    try {
        const getDate = Helper.createDateIterator(config.sinceDate);
        let gotScraping;
        gotScraping ??= (await import('got-scraping')).gotScraping;

     
        let proxyUrl = config.proxyManager.getProxyBasedOnConfig(config);
        let date = getDate();
        let retryCount = 0;
        while (date !== null){
            logger.info(`Running date: ${date}`);
            try {
                
                let { body, statusCode } = await gotScraping.get({
                    url:`https://www.sn.pl/wyszukiwanie/SitePages/orzeczenia.aspx?DataWDniu=${date}`,			
                    headers: {
                        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                        'accept-language': 'en-US,en;q=0.9,pl;q=0.8',
                        'cache-control': 'no-cache',
                        'pragma': 'no-cache',
                        'priority': 'u=0, i',
                        'referer': 'https://www.sn.pl/wyszukiwanie/SitePages/orzeczenia.aspx',
                        'sec-ch-ua': Constants.NEWEST_CHROME_SEC_CH_UA,
                        'sec-ch-ua-mobile': '?0',
                        'sec-ch-ua-platform': '"Windows"',
                        'sec-fetch-dest': 'document',
                        'sec-fetch-mode': 'navigate',
                        'sec-fetch-site': 'same-origin',
                        'sec-fetch-user': '?1',
                        'upgrade-insecure-requests': '1',
                        'user-agent': Constants.NEWEST_CHROME_USER_AGENT,
                    },
                    followRedirect: false,
                    cookieJar: config.cookieJar,
                    throwHttpErrors: false,
                    proxyUrl: proxyUrl,        
                    timeout: {
                        request: config.timeout,
                    },
                });
                if (statusCode == 200) {
                    if (Helper.isEmptySearch(body, date)) {
                        logger.info('No results found for date:', date);
                    } else {
                        const polishDate = Helper.formatPolishDate(date);
                        const parseResults = Helper.parseResults(body);
                        for (const result of parseResults) {
                            const [existingRecords] = await config.database.pool.query(
                                'SELECT item_sid FROM scraped_data WHERE item_sid = ?',
                                [result.itemSid]
                            );
                    
                            if (existingRecords && existingRecords.length > 0) {
                                logger.info(`Skipping duplicate case with ItemSID: ${result.itemSid}`);
                                continue;
                            }

                            const {status: detailsStatus, body: caseBody} = await getDetails(result.caseLink, config, gotScraping, proxyUrl);
                            if (detailsStatus !== 200) {
                                throw new Error(`bad statusCode in detailsBody scraping: ${detailsStatus}`);
                            }
                            const {status: judgmentStatus, body: judgmentBody} = await getDetails(result.judgementLink, config, gotScraping, proxyUrl);
                            if (judgmentStatus !== 200) {
                                throw new Error(`bad statusCode in judgmentBody scraping: ${judgmentStatus}`);
                            }
                            const data = {
                                item_sid: result.itemSid,
                                page_html: caseBody,
                                page_link: result.caseLink,
                                judgment_html: judgmentBody,
                                judgment_link: result.judgementLink,
                                title: result.caseNumber,
                                date: polishDate,
                                year: parseInt(date.split('-')[0], 10),
                                status_code: statusCode,
                            };
                            
                            await config.database.insertData('scraped_data', data);
                        }

                    }
                } else if (statusCode == 404) {
                    logger.warn(`Page does not exist: ${statusCode}, url: https://www.sn.pl/wyszukiwanie/SitePages/orzeczenia.aspx?DataWDniu=${date}`);
                } else {
                    throw new Error(`bad status code: ${statusCode}, url: https://www.sn.pl/wyszukiwanie/SitePages/orzeczenia.aspx?DataWDniu=${date}`);                  
                }
                await sleep(config.delay);
                retryCount = config.maxRetries;
                date = getDate();
            } catch (error) {
                logger.error(`Found error scraping sn: ${error.message}, date: ${date}`);
                if (config.abortOnFailure) {
                    return;
                } else if (retryCount >= config.maxRetries) {
                    logger.warn(`Max retries reached for date: ${date}`);
                    date = getDate();
                    retryCount = 0;
                } else {
                    retryCount++;
                    await sleep(config.retryDelay);
                }

            }

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