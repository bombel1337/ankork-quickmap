const { Sites } = require('./utils/constants');
const ProxyManager = require('./services/proxyManager');

const config = require('./scraper.config');




const log4js = require('log4js');
const logger = log4js.getLogger('index');


const run = {
  [Sites.orzeczenia_uzp_gov]: () => {

    if (config.models[Sites.orzeczenia_uzp_gov]) {

        console.log(config);



        const uzpModule = require(`./models/${Sites.orzeczenia_uzp_gov}`);
        uzpModule.scraper(config);
    }

  },

};

const selectedSite = process.argv[2];

if (selectedSite) {
  if (run[selectedSite]) {
    run[selectedSite]();
  } else {
    logger.warn(`No runner function found for site "${selectedSite}"`);
  }
} else {
  Object.keys(run).forEach(siteKey => {
    logger.log(`Running scraper for site: ${siteKey}`);
    run[siteKey]();
  });
}
