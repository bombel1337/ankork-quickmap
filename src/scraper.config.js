const Database = require('./config/database');
const { CookieJar } = require('tough-cookie');
const { Sites } = require('./utils/constants');
const {createDataParser} = require('./services/dataParser');
const ProxyManager = require('./services/proxyManager');

const config = {
    runMode: 'tests',
    abortOnFailure: false,
    cookieJar: new CookieJar(),
    delay: 11,
    timeout: 10000,
    maxRetries: 2,
    retryDelay: 1111,
    saveResults: true,
    proxyManager: new ProxyManager(),

    models: {
        uzp: {
            enabled: false,
            database: new Database(Sites.orzeczenia_uzp_gov),
            useDataParser: true,
            dataParser: createDataParser(Sites.orzeczenia_uzp_gov),
            delay: 111,
            scrapLength: 125,
        },
        sn: {
            enabled: false,
            database: new Database(Sites.sad_najwyzszy),
            useDataParser: true,
            dataParser: createDataParser(Sites.sad_najwyzszy),
            delay: 11551,
            sinceDate: '2025-02-18', // 'yyyy-mm-dd'    
        },
        ms: {
            enabled: true,
            database: new Database(Sites.orzeczenia_ms_gov),
            useDataParser: true,
            dataParser: createDataParser(Sites.orzeczenia_ms_gov),
            delay: 1111,
            sinceDate: '2024-02-18', // 'yyyy-mm-dd' 
            proxies: {
                enabled: true,
                rotate: 'random' // 'random' or 'sequential'
            },   
        },
    }
};

module.exports = config;