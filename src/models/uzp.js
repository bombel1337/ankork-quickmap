const { Constants } = require('../utils/constants');


const { sleep } = require('../utils/helpers');


const log4js = require('log4js');
const logger = log4js.getLogger('uzp');



const scrape = async (config) => {
    try {
        let gotScraping;
        gotScraping ??= (await import('got-scraping')).gotScraping;
        
        let resp = await gotScraping.get({
            url:`https://orzeczenia.uzp.gov.pl/`,			
            headers: {
                "sec-ch-ua": Constants.CHROME_SEC_CH_UA133,
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": "\"Windows\"",
                "upgrade-insecure-requests": "1",
                "user-agent": Constants.UserAgentChrome133,
                "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
                "sec-fetch-site": "none",
                "sec-fetch-mode": "navigate",
                "sec-fetch-user": "?1",
                "sec-fetch-dest": "document",
                "accept-encoding": "gzip, deflate, br",
                "accept-language": "en-GB,en;q=0.9",
            },
            followRedirect: true,
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
        console.log(resp)      
    } catch (error) {
       
    }
   
    
}


async function scraper(config) {
    console.log("Starting scraper with settings:");
    console.log(config);

    await scrape(config);


    console.log("Scraping completed.");
}
module.exports = {
    scraper,
  };