const Database = require('./config/database');
const { CookieJar } = require('tough-cookie');
const { Sites } = require('./utils/constants');
const createDataParser = require('./services/dataParser');

const config = {
    runMode: 'tests',
    abortOnFailure: false,
    cookieJar: new CookieJar(),
    delay: 11,
    timeout: 10000,
    maxRetries: 2,
    retryDelay: 1111,
    saveResults: true,

    proxies: {
        enabled: false,
        rotate: 'random' // 'random' or 'sequential'
    },

    proxyManager: null,

    // New structure using models object
    models: {
        uzp: {
            enabled: false,
            database: new Database(Sites.orzeczenia_uzp_gov),
            useDataParser: true,
            dataParser: createDataParser(Sites.orzeczenia_uzp_gov),
            delay: 111,
            scrapLength: 125,
        },
        // You can add more models here
        // example: {
        //     enabled: false,
        //     database: new Database('example'),
        //     useDataParser: true,
        //     dataParser: createDataParser('example'),
        //     delay: 5000,
        //     scrapLength: 100,
        // }
    }
};

module.exports = config;