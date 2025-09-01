const { Constants } = require('../../utils/constants');
const { sleep } = require('../../utils/helpers');
const getLogger = require('../../utils/logger');
const { Sites } = require('../../utils/constants');
const Helper = require('./helper');
const logger = getLogger('nsa');
const FormData = require('form-data');

const processSingleLink = async (url, config, gotScraping, retryCount = 0) => {
    try { 
        const proxyUrl = config.proxyManager.getProxyBasedOnConfig(config);
        let {body, statusCode} = await gotScraping.get({
            url,			
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': 'en-US,en;q=0.9,pl;q=0.8',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Pragma': 'no-cache',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1',
                'User-Agent': Constants.NEWEST_CHROME_USER_AGENT,
                'sec-ch-ua': Constants.NEWEST_CHROME_SEC_CH_UA,
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',    
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
            throw new Error(`processSingleLink: bad status code: ${statusCode}, url: ${url}`);
        }
        const prawomocne = body.includes('nieprawomocne') ? 0 : 1;
        const uzasadnienie = body.includes('info-list-label-uzasadnienie') ? 1 : 0;

        return { status: statusCode, body, prawomocne, uzasadnienie };
    } catch (error) {
        if (error.message === 'socket hang up') {
            logger.warn(`processSingleLink Socket hang up error for url: ${url}, retrying...`);
            await sleep(config.retryDelay);
            return processSingleLink(url, config, gotScraping, retryCount);
        }
        logger.error(`processSingleLink Found error scraping nsa process: ${error.message}`);
        if (config.abortOnFailure || retryCount >= config.maxRetries) {
            logger.warn(`processSingleLink Max retries reached for page: ${url}`);
        } else {
            await sleep(config.retryDelay);
            return processSingleLink(url, config, gotScraping, retryCount+1);
        }
        // return { status: 500, body: error.message };
        throw new Error(`processSingleLink: ${error.message}`);
    }
};

const processPage = async (url, config, gotScraping, retryCount = 0) => {
    try { 
        const proxyUrl = config.proxyManager.getProxyBasedOnConfig(config);
        let {body, statusCode} = await gotScraping.get({
            url,			
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': 'en-US,en;q=0.9,pl;q=0.8',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Pragma': 'no-cache',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1',
                'User-Agent': Constants.NEWEST_CHROME_USER_AGENT,
                'sec-ch-ua': Constants.NEWEST_CHROME_SEC_CH_UA,
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',    
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
            throw new Error(`processPage: bad status code: ${statusCode}, url: ${url}`);
        }
        return { status: statusCode, body };
    } catch (error) {
        if (error.message === 'socket hang up') {
            logger.warn(`processPage Socket hang up error for url: ${url}, retrying...`);
            await sleep(config.retryDelay);
            return processPage(url, config, gotScraping, retryCount);
        }
        logger.error(`processPage Found error scraping nsa process: ${error.message}`);
        if (config.abortOnFailure || retryCount >= config.maxRetries) {
            logger.warn(`processPage Max retries reached for page: ${url}`);
        } else {
            await sleep(config.retryDelay);
            return processPage(url, config, gotScraping, retryCount+1);
        }
        // return { status: 500, body: error.message };
        throw new Error(`processPage: ${error.message}`);
    }
};

const processDateRange = async (config, fromDate, toDate, retryCount = 0) => {
    try {
        logger.info(`Processing date range: ${fromDate} to ${toDate}`);
        let gotScraping;
        gotScraping ??= (await import('got-scraping')).gotScraping;
    
        const proxyUrl = config.proxyManager.getProxyBasedOnConfig(config);
    
        
        const searchData = {
            wszystkieSlowa: '',
            wystepowanie: 'gdziekolwiek',
            odmiana: 'on',
            sygnatura: '',
            sad: 'dowolny',
            rodzaj: 'dowolny',
            symbole: '',
            odDaty: fromDate,
            doDaty: toDate,
            sedziowie: '',
            funkcja: 'dowolna',
            rodzaj_organu: '',
            hasla: '',
            akty: '',
            przepisy: '',
            publikacje: '',
            glosy: '',
            submit: 'Szukaj'
        };
    
        const formData = new FormData();

        Object.entries(searchData).forEach(([key, value]) => {
            formData.append(key, value);
        });

        // Initial request to get first page and pagination info
        let { body, statusCode } = await gotScraping.post({
            url: 'https://orzeczenia.nsa.gov.pl/cbo/search',			
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': 'en-US,en;q=0.9,pl;q=0.8',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Origin': 'https://orzeczenia.nsa.gov.pl',
                'Pragma': 'no-cache',
                'Referer': 'https://orzeczenia.nsa.gov.pl/cbo/search',
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
            body: formData,
            followRedirect: true,
            cookieJar: config.cookieJar,
            throwHttpErrors: false,
            proxyUrl,        
            timeout: {
                request: config.timeout,
            },
        });
    
        if (statusCode === 200) {
            const maxPage = Helper.extractMaxPage(body);
            logger.info(`Max page number: ${maxPage}`);
            for (let page = maxPage; page >= 1; page--) {
                const url = `https://orzeczenia.nsa.gov.pl/cbo/find?p=${page}`;
                logger.info(`Processing page ${page} of ${maxPage}`);
                const { status, body } = await processPage(url, config, gotScraping);
                console.log(`Page ${page} status: ${status}`);
                const results = Helper.extractElements(body);
                // Helper.saveResultsToCsv(results, page, `${fromDate} - ${toDate}`);

                // Insert results into the database
                for (const result of results) {
                    try {
                        await config.database.insertData('scraped_data', {
                            link: result.href,
                            date: result.date,
                            title: result.title
                        }, 'link'); 
                    } catch (dbError) {
                        logger.error(`Failed to insert record with link ${result.href}: ${dbError.message}`);
                    }
                }

                await sleep(config.delay);
            }

            return;  
        } else if (statusCode == 404) {
            logger.warn(`Page does not exist: ${statusCode}, since: ${fromDate}, to: ${toDate}`);
            return;
        } else {
            console.log(body);
            throw new Error(`bad status code: ${statusCode}, since: ${fromDate}, to: ${toDate}`);                  
        }
    
    } catch (error) {
        if (error.message === 'socket hang up') {
            logger.warn(`Socket hang up getting date range: ${fromDate} to ${toDate}, retrying...`);
            await sleep(config.retryDelay);
            return processDateRange(config, fromDate, toDate, retryCount);
        }
        logger.error(`Found error processing date range: ${error.message}, range: ${fromDate} to ${toDate}`);
        if (config.abortOnFailure || retryCount >= config.maxRetries) {
            logger.warn(`Max retries reached for date range: ${fromDate} to ${toDate}`);
        } else {
            await sleep(config.retryDelay);
            return processDateRange(config, fromDate, toDate, retryCount+1);
        }
        throw new Error(`Error processing date range ${fromDate} to ${toDate}: ${error.message}`);
    }
};

const singlesScraper = async (config) => {
    try {
        let gotScraping;
        gotScraping ??= (await import('got-scraping')).gotScraping;
        logger.info('Starting singlesScraper...');
        const query = `
            SELECT link 
            FROM scraped_data 
            WHERE (status_code IS NULL OR status_code != 200)
               OR (prawomocne IS NULL OR prawomocne != 1)
               OR (uzasadnienie IS NULL OR uzasadnienie != 1)
        `;
        const results = await config.database.query(query);
        const links = results.map(row => row.link);

        logger.info(`Found ${links.length} links to re-scrape.`);
        for (const link of links) {
            const url = `https://orzeczenia.nsa.gov.pl${link}`;
            logger.info(`Re-scraping link: ${url}`);

            const results = await processSingleLink(url, config, gotScraping);
            await config.database.updateData('scraped_data', {
                status_code: results.status,
                prawomocne: results.prawomocne,
                uzasadnienie: results.uzasadnienie,
                link_html: results.body
            }, 'link', link);       
        }

    } catch (error) {
        logger.error(`Error in singlesScraper: ${error.message}`);
    }
};

const scrape = async (config) => {
    try {

        const todaysDate = config?.toDate ?? Helper.getTodaysDate();
        const sinceDate = config?.sinceDate ?? '2015-01-01';
    
        logger.info(`Starting NSA scraper from ${sinceDate} to ${todaysDate}`);
    
        const dateRanges = Helper.createDateRanges(sinceDate, todaysDate);
        logger.info(`Created ${dateRanges.length} date ranges to process`);
    
        for (const range of dateRanges.reverse()) { 
            await processDateRange(config, range.fromDate, range.toDate);
            await sleep(config.delay);
        }
    
        logger.info('NSA scraping completed successfully');
    } catch (error) {
        logger.error(`Error in scraper: ${error.message}`);
    }
};

async function scraper(config) {
    const tasks = [];
    await config.database.initialize();

    if (config.models[Sites.orzeczenia_nsa_gov] && config.models[Sites.orzeczenia_nsa_gov].enabled & config.models[Sites.orzeczenia_nsa_gov].pageLinksScraper) {
        logger.info('Running model:', Sites.orzeczenia_nsa_gov);
        tasks.push(scrape(config));
    }
    if (config.models[Sites.orzeczenia_nsa_gov] && config.models[Sites.orzeczenia_nsa_gov].enabled && config.models[Sites.orzeczenia_nsa_gov].singleLinksScraper) {
        logger.info('Running singlesScraper for:', Sites.orzeczenia_nsa_gov);
        tasks.push(singlesScraper(config));
    }

    await Promise.all(tasks);
    await config.database.close();
}

module.exports = {
    scraper,
};