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

    models: {
        uzp: {
            enabled: false,
            database: new Database(Sites.orzeczenia_uzp_gov),
            useDataParser: false,
            dataParser: createDataParser(Sites.orzeczenia_uzp_gov),
            delay: 111,
            scrapLength: 125,
        },
        sn: {
            enabled: true,
            database: new Database(Sites.sad_najwyzszy),
            useDataParser: true,
            dataParser: createDataParser(Sites.sad_najwyzszy),
            delay: 111,
            sinceDate: "2024-12-29",
        },
    }
};

module.exports = config;