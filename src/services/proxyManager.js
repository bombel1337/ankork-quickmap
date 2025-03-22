const fs = require('fs');
const log4js = require('log4js');
const logger = log4js.getLogger('proxyManager');


class ProxyManager {
    constructor(proxyFilePath = 'proxies.txt') {
        this.proxyFilePath = proxyFilePath;
        this.proxies = [];
        this.currentProxyIndex = 0;
        this.usedProxies = new Set(); 
        this.loadProxies();
    }
    isProxyless() {
        return this.isProxyless;
    }
    getProxyBasedOnConfig(config) {
        if (config?.proxies?.enabled && config?.proxyManager) {
            const proxy =  config.proxies.rotate === 'random'
                ? this.getRandomProxy()
                : this.getNextProxy();
            return proxy;
        }
        return undefined;
    }
    loadProxies() {
        try {
            const fileContent = fs.readFileSync(this.proxyFilePath, 'utf8');
            this.proxies = fileContent.split('\n')
                .map(line => line.trim())
                .filter(line => line !== '');


            this.isProxyless = this.proxies.length === 0;

            logger.info(`Loaded ${this.proxies.length} proxies from ${this.proxyFilePath}`);
      
            if (this.proxies.length === 0) {
                logger.warn(this.proxies);
                logger.warn('No valid proxies found in the proxy file');
            }
            this.usedProxies.clear();

        } catch (error) {
            logger.error(`Failed to load proxy file: ${error.message}`);
            this.proxies = [];
        }
    }

    getNextProxy() {
        if (this.proxies.length === 0) {
            if (!this.isProxyless)    logger.warn('No proxies available');
            return undefined;
        }

        const proxy = this.proxies[this.currentProxyIndex];
        logger.debug(`Using proxy: ${(proxy)}`);
    
        this.currentProxyIndex = (this.currentProxyIndex + 1) % this.proxies.length; // (9 + 1) % 10 = 0
    
        return this.formatProxy(proxy);
    }
    getRandomProxy() {
        if (this.proxies.length === 0) {
            if (!this.isProxyless)    logger.warn('No proxies available');
            return undefined;
        }

        if (this.usedProxies.size >= this.proxies.length) {
            this.usedProxies.clear();
        }

        const availableProxies = this.proxies.filter(proxy => !this.usedProxies.has(proxy));
    
        const proxyPool = availableProxies.length > 0 ? availableProxies : this.proxies;
    
        const randomIndex = Math.floor(Math.random() * proxyPool.length);
        const proxy = proxyPool[randomIndex];
    
        this.usedProxies.add(proxy);
    
        logger.debug(`Randomly selected proxy: ${(proxy)}`);
    
        return this.formatProxy(proxy);
    }
  
    formatProxy(proxyString) {
        const currentProxy = proxyString.split(':');
        if (currentProxy.length === 2) {
            return `http://${currentProxy[0]}:${currentProxy[1]}`.trim();
        } else {
            return `http://${currentProxy[2]}:${currentProxy[3]}@${currentProxy[0]}:${currentProxy[1]}`.trim();
        }
    }

    refreshProxies() {
        logger.info('Refreshing proxy list');
        this.loadProxies();
    }
}

module.exports = ProxyManager;