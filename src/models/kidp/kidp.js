const { Constants } = require('../../utils/constants');
const { sleep } = require('../../utils/helpers');
const getLogger = require('../../utils/logger');
const { Sites } = require('../../utils/constants');

const Helper = require('./helper');
const logger = getLogger('kidp');  
const getDetails = async (url, config, gotScraping, proxyUrl, retryCount = 0) => {
    try { 
        let {body, statusCode} = await gotScraping.get({
            url,			
            headers: {
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'accept-language': 'en-US,en;q=0.9,pl;q=0.8',
                'cache-control': 'no-cache',
                'pragma': 'no-cache',
                'priority': 'u=0, i',
                'referer': url,
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
            proxyUrl,        
            timeout: {
                request: config.timeout,
            },
        });
        if (statusCode !== 200) {
            throw new Error(`getDetails: bad status code: ${statusCode}, url: ${url}`);
        }
        return { status: statusCode, body };
    } catch (error) {
        logger.error(`Found error scraping kidp getDetails: ${error.message}, page: ${url}`);
        if (config.abortOnFailure) {
            logger.error(`Aborting on failure for getDetails page: ${url}.`);
        } else if (retryCount >= config.maxRetries) {
            logger.warn(`Max retries reached for getDetails page: ${url}.`);
        } else {
            await sleep(config.retryDelay);
            return getDetails(url, config, gotScraping, proxyUrl, retryCount+1);
        }
        throw new Error(`getDetails: ${error.message}`);
    }
};

const extendedScrape = async (config) => {
    try {
        let gotScraping;
        gotScraping ??= (await import('got-scraping')).gotScraping;
        
        let proxyUrl = config.proxyManager.getProxyBasedOnConfig(config);

        let retryCount = 0;
        while (retryCount < config.maxRetries) {
            try {
                const url = 'https://podatkibezryzyka.pl/znajdz-doradce-wyniki-wyszukiwania';
    
                let { body, statusCode } = await gotScraping.get({
                    url,			
                    headers: {
                        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                        'accept-language': 'en-US,en;q=0.9,pl;q=0.8',
                        'cache-control': 'no-cache',
                        'pragma': 'no-cache',
                        'priority': 'u=0, i',
                        'referer': url,
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
                    followRedirect: true,
                    cookieJar: config.cookieJar,
                    throwHttpErrors: false,
                    proxyUrl,        
                    timeout: {
                        request: config.timeout,
                    },
                });
                if (statusCode !== 200) {
                    throw new Error(`Bad status code: ${statusCode}, url: ${url}`);
                }
                const extendedDetails = Helper.getDetailsExtendedScrape(body);
                for (const advisor of extendedDetails) {
                    const url = `https://podatkibezryzyka.pl${advisor.url}`;
                    const { body, status } = await getDetails(url, config, gotScraping, proxyUrl);
                    
                    const details = Helper.getCounselorDetails(body);
                        
                    // Skip if we couldn't extract a registration number
                    if (!details.registrationNumber) {
                        logger.warn(`Skipping advisor without registration number: ${advisor.name}`);
                        continue;
                    }
                    
                    
                    const data = {
                        podatkibezryzyka_body: body,
                        podatkibezryzyka_link: url,
                        podatkibezryzyka_status: status,
                        imie_nazwisko: details.name || advisor.name,
                        numer_wpisu: details.registrationNumber,
                        telefon: details.contact?.phone || null,
                        email: details.contact?.email || null,
                        adres: details.contact?.address || null,
                        image: advisor.image ? `https://podatkibezryzyka.pl${advisor.image}` : null,
                        description: details.description || null,
                        twitter: details.socialLinks?.twitter || null,
                        linkedin: details.socialLinks?.linkedin || null,
                        facebook: details.socialLinks?.facebook || null,
                        other_socials: details.socialLinks?.other?.length > 0 ? details.socialLinks.other.join(' | ') : null,
                        specialties: advisor.specialties?.join(', ') || null,
                    };
                    
                    await config.database.insertData('pbr_parsed_data', data, 'numer_wpisu');
                    await sleep(config.delay);
                    
                }
                
            } catch (error) {
                logger.error(`Found error extendedScrape podatkibezryzyka: ${error.message}.`);
                if (config.abortOnFailure) {
                    logger.error('Aborting on failure extendedScrape.');
                    return;
                } else if (retryCount >= config.maxRetries) {
                    logger.warn('Max retries reached for extendedScrape.');
                    retryCount = 0;
                } else {
                    retryCount++;
                    await sleep(config.retryDelay);
                }
    
            }
        }



        

     


    } catch (error) {
        logger.error(`Error in extendedScrape: ${error.message}`);
    }
};

const scrape = async (config) => {
    try {
        let gotScraping;
        gotScraping ??= (await import('got-scraping')).gotScraping;
        
        let proxyUrl = config.proxyManager.getProxyBasedOnConfig(config);
        let maxRegion = 18;
        let currentRegion = 3;
        let retryCount = 0;
        let currentPage = 1;
        while (currentRegion < maxRegion + 1) {
            try {
                const url = `https://kidp.pl/wyszukaj-doradce-podatkowego?region=${currentRegion}&rodo=on&page=${currentPage}`;

                let { body, statusCode } = await gotScraping.get({
                    url,			
                    headers: {
                        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                        'accept-language': 'en-US,en;q=0.9,pl;q=0.8',
                        'cache-control': 'no-cache',
                        'pragma': 'no-cache',
                        'priority': 'u=0, i',
                        'referer': url,
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
                    followRedirect: true,
                    cookieJar: config.cookieJar,
                    throwHttpErrors: false,
                    proxyUrl,        
                    timeout: {
                        request: config.timeout,
                    },
                });
                if (statusCode !== 200) {
                    throw new Error(`Bad status code: ${statusCode}, url: ${url}`);
                }
                retryCount = 0;
                const advisors = Helper.getDetails(body);
                for (const advisor of advisors) {
                    const { body, status } = await getDetails(advisor.url, config, gotScraping, proxyUrl);
                 

                    const data = {
                        page_html: body,
                        page_link: url,
                        status_code: status,
                        page: currentPage,
                        region: currentRegion,
                        advisor_url: advisor.url,
                        advisor_title: advisor.title,
                        advisor_info: advisor.info,
                    };
        
                    await config.database.insertData('scraped_data', data, 'advisor_url');
                    await sleep(config.delay);
                }
                if (Helper.isLastPage(body)) {
                    logger.info(`Last page reached for region: ${currentRegion}, page: ${currentPage}.`);
                    currentRegion++;
                    currentPage = 1;
                } else {
                    currentPage++;
                }
                await sleep(config.delay);
            
            } catch (error) {
                logger.error(`Found error scraping kidp: ${error.message}, region: ${currentRegion}, page: ${currentPage}.`);
                if (config.abortOnFailure) {
                    logger.error(`Aborting on failure for region: ${currentRegion}, page: ${currentPage}.`);
                    return;
                } else if (retryCount >= config.maxRetries) {
                    logger.warn(`Max retries reached for region: ${currentRegion}, page: ${currentPage}.`);
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


    if (config.models[Sites.krajowa_izba_doradcow_podatkowych]) {
        if (config.models[Sites.krajowa_izba_doradcow_podatkowych].podatkibezryzykaInfo) {
            logger.info('Running data parser');
            tasks.push(extendedScrape(config));
        }
        if (config.models[Sites.krajowa_izba_doradcow_podatkowych].kidpInfo) {
            logger.info('Running model:', Sites.krajowa_izba_doradcow_podatkowych);
            tasks.push(scrape(config));
        }
    }


    await Promise.all(tasks);
    
    await config.database.close();
}

module.exports = {
    scraper,
};