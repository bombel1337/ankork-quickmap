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
    maxRetries: 10,
    retryDelay: 30111,
    proxyManager: new ProxyManager(),

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
            enabled: false,
            database: new Database(Sites.sad_najwyzszy),
            useDataParser: true,
            dataParser: createDataParser(Sites.sad_najwyzszy),
            delay: 11551,
            sinceDate: '2025-02-18', // 'yyyy-mm-dd'    
        },
        ms: {
            enabled: false,
            database: new Database(Sites.orzeczenia_ms_gov),
            useDataParser: false,
            dataParser: createDataParser(Sites.orzeczenia_ms_gov),
            delay: 1111,
            sinceDate: '2020-01-01', // 'yyyy-mm-dd' 
            proxies: {
                enabled: true,
                rotate: 'random' // 'random' or 'sequential'
            },   
        },
        nsa: {
            enabled: false,
            database: new Database(Sites.orzeczenia_nsa_gov),
            useDataParser: true,
            dataParser: createDataParser(Sites.orzeczenia_nsa_gov),
            singleLinksScraper: false,
            delay: 1111,
            retryDelay: 10000,
            proxies: {
                enabled: true,
                rotate: 'random' // 'random' or 'sequential'
            },   
            toDate: '2023-07-06', // 'yyyy-mm-dd'
            sinceDate: '2010-01-01', // 'yyyy-mm-dd'  
        },
        kidp: {
            enabled: false,
            kidpInfo: false,
            podatkibezryzykaInfo: false,
            database: new Database(Sites.krajowa_izba_doradcow_podatkowych),
            useDataParser: false,
            dataParser: createDataParser(Sites.krajowa_izba_doradcow_podatkowych),
            delay: 111,
            scrapLength: 125,
        },
    }
};

module.exports = config;