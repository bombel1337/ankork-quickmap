const { Constants } = require('../../utils/constants');
const { sleep } = require('../../utils/helpers');
const getLogger = require('../../utils/logger');
const { Sites } = require('../../utils/constants');

const Helper = require('./helper');
const logger = getLogger('ms');  

function isMsCaptcha(html) {
    const markers = [
        'Wykryliśmy zbyt dużą liczbę zapytań',
        'id="captchaForm"',
        '/captcharenderer/',
        'name="captchaConfirmationField"',
        'f5_cspm',
        '/TSPD/?type='
    ];
    return markers.some(m => html.includes(m));
}
const getDetails = async (url, config, gotScraping, proxyUrl, retryCount = 0) => {
    try { 
        let {body, statusCode} = await gotScraping.get({
            url,			
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': 'en-US,en;q=0.9,pl;q=0.8',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Pragma': 'no-cache',
                'Referer': url,
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'same-origin',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1',
                'User-Agent': Constants.NEWEST_CHROME_USER_AGENT,
                'sec-ch-ua': Constants.NEWEST_CHROME_SEC_CH_UA,
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',              
            },
            followRedirect: false,
            // cookieJar: config.cookieJar,
            throwHttpErrors: false,
            proxyUrl,        
            timeout: {
                request: config.timeout,
            },
        });
        if (statusCode !== 200) {
            if (statusCode === 400) {
                logger.warn(`Bad request for url: ${url}, probably doesn't exist.`);
                return {
                    status: statusCode,
                    body: null
                };
            }
            throw new Error(`bad status code: ${statusCode}, url: ${url}`);
        }
        if (body.includes('<title>Połączenie odrzucone</title>')) {
            proxyUrl = config.proxyManager.getProxyBasedOnConfig(config);
            throw new Error('connection refused by server');
        }
        if (isMsCaptcha(body)) {
            logger.warn(`Captcha detected for url: ${url}`);
            return {
                status: 403,
                body: 'Captcha detected'
            };
        }
        return { status: statusCode, body };
    } catch (error) {
        logger.error(`Found error scraping ms getDetails: ${error.message}, page: ${url}`);
        if (config.abortOnFailure || retryCount >= config.maxRetries) {
            logger.warn(`Max retries reached for page: ${url}`);
        } else {
            await sleep(config.retryDelay);
            return getDetails(url, config, gotScraping, proxyUrl, retryCount+1);
        }
        throw new Error(`getDetails: ${error.message}`);
    }
};


const scrape = async (config) => {
    try {
        let gotScraping;
        gotScraping ??= (await import('got-scraping')).gotScraping;

        const todaysDate = Helper.getTodaysDate();
        const sinceDate = config?.sinceDate ?? '2025-02-18';
        
        let proxyUrl = config.proxyManager.getProxyBasedOnConfig(config);
        let page = 3;
        let maxPage = 0;
        let allResultsLength = 0;
        let retryCount = 0;
        while (maxPage === 0 || page <= maxPage){
            const url = `https://orzeczenia.ms.gov.pl/search.gridpager/${page}?t:ac=advanced/$N/$N/$N/$N/$N/$N/$N/${sinceDate}/${todaysDate}/$N/$N/$N/$N/$N/$N/score/descending/${page}`;

            try {
                let { body, statusCode } = await gotScraping.get({
                    url,			
                    headers: {
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                        'Accept-Language': 'en-US,en;q=0.9,pl;q=0.8',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive',
                        'Pragma': 'no-cache',
                        'Referer': url,
                        'Sec-Fetch-Dest': 'document',
                        'Sec-Fetch-Mode': 'navigate',
                        'Sec-Fetch-Site': 'same-origin',
                        'Sec-Fetch-User': '?1',
                        'Upgrade-Insecure-Requests': '1',
                        'User-Agent': Constants.NEWEST_CHROME_USER_AGENT,
                        'sec-ch-ua': Constants.NEWEST_CHROME_SEC_CH_UA,
                        'sec-ch-ua-mobile': '?0',
                        'sec-ch-ua-platform': '"Windows"',                      
                    },
                    followRedirect: true,
                    // cookieJar: config.cookieJar,
                    throwHttpErrors: false,
                    proxyUrl,        
                    timeout: {
                        request: config.timeout,
                    },
                });
                if (statusCode == 200) {
                    if (maxPage === 0) {
                        maxPage = Helper.getLastPageNumber(body);
                        allResultsLength = Helper.getResultsLength(body, sinceDate);
                        logger.log(`Starting at page: ${page}, out of: ${maxPage} for date since: ${sinceDate} to ${todaysDate}. All results length ${allResultsLength}`);
                    } else  if (allResultsLength <= 10) {
                        logger.log(`Running last page: ${page}.`);
                    } 
                    logger.log(`Running page: ${page}, pages left: ${maxPage - page} and ${allResultsLength} results. Link: ${url}`);
                    if (body.includes('<title>Połączenie odrzucone</title>')) {
                        proxyUrl = config.proxyManager.getProxyBasedOnConfig(config);
                        throw new Error('connection refused by server');
                    }



                    const results = Helper.extractCourtCases(body);
                    if (allResultsLength > 0 && results.length === 0) {
                        logger.warn(`No results found for page: ${page} and date since: ${sinceDate} to ${todaysDate}`);
                        break;
                    }
                    for (const result of results) {
                        const [existingRecords] = await config.database.pool.query(
                            'SELECT id FROM scraped_data WHERE title = ?',
                            [result.title]
                        );
                
                        if (existingRecords && existingRecords.length > 0) {
                            logger.info(`Skipping duplicate case: ${result.title}`);
                            continue;
                        }
                        const globalLink = `https://orzeczenia.ms.gov.pl${result.link}`;
                        const detailsLink = globalLink;
                        const judgmentLink = globalLink.replace('/details', '/content');
                        const regulationsLink = globalLink.replace('/details', '/regulations');

                        const detailsContent = await getDetails(globalLink, config, gotScraping, proxyUrl);                     
                        const judgmentContent = await getDetails(globalLink.replace('/details', '/content'), config, gotScraping, proxyUrl);
                        const regulationsContent = await getDetails(globalLink.replace('/details', '/regulations'), config, gotScraping, proxyUrl);

                        const data = {
                            details_html: detailsContent.body,
                            judgment_html: judgmentContent.body,
                            regulations_html: regulationsContent.body,
                            title: result.title,
                            details_link: detailsLink,
                            judgment_link: judgmentLink,
                            regulations_link: regulationsLink,
                            status_code: statusCode,
                            page,
                            page_link: url,
                        };
            
                        await config.database.insertData('scraped_data', data);
                    }

                    allResultsLength -= 10;
                    page+=1;
                } else if (statusCode == 404) {
                    logger.warn(`Page does not exist: ${statusCode}, url: ${url}`);
                } else {
                    throw new Error(`bad status code: ${statusCode}, url: ${url}`);                  
                }

                await sleep(config.delay);
                retryCount = 0;
            } catch (error) {
                logger.error(`Found error scraping ms: ${error.message}, date since: ${sinceDate} to ${todaysDate}, page ${page}`);
                if (config.abortOnFailure) {
                    logger.error(`Aborting on failure for page: ${page} and date since: ${sinceDate} to ${todaysDate}`);
                    return;
                } else if (retryCount >= config.maxRetries) {
                    logger.warn(`Max retries reached for page: ${page} and date since: ${sinceDate} to ${todaysDate}`);
                    return;
                } else {
                    retryCount++;
                    await sleep(config.retryDelay);
                }

            }
            page += 1;
        } 

        

     


    } catch (error) {
        logger.error(`Error in scraper: ${error.message}`);
    }
};


async function scraper(config) {
    await config.database.initialize();

    const tasks = [];

    
    if (config.models[Sites.orzeczenia_ms_gov] && config.models[Sites.orzeczenia_ms_gov].enabled) {
        logger.info('Running model:', Sites.orzeczenia_ms_gov);
        tasks.push(scrape(config));
    }

    await Promise.all(tasks);
    
    await config.database.close();
}

module.exports = {
    scraper,
};