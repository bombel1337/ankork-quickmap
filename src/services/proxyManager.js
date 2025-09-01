const fs = require('fs');
const log4js = require('log4js');
const logger = log4js.getLogger('proxyManager');

function mask(p) {
    if (!p) return p;
    // http://user:pass@host:port  -> http://***:***@host:port
    try {
        const u = new URL(p);
        if (u.username || u.password) {
            u.username = '***';
            u.password = '***';
            return u.toString();
        }
    } catch {
        return p; // jeśli nie jest to prawidłowy URL, zwróć oryginał
    }
    if (p.includes('@')) {
        const [, host] = p.split('@');
        return `***:***@${host}`;
    }
    return p;
}
class ProxyManager {
    constructor(proxyFilePath = 'proxies.txt') {
        this.proxyFilePath = proxyFilePath;
        this.proxies = [];
        this.currentProxyIndex = 0;
        this.usedProxies = new Set(); 
        this.loadProxies();
    }
    get isProxyless() {
        return this.proxies.length === 0;
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
            this.proxies = [...new Set(
                fileContent
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line && !line.startsWith('#')) // pomiń puste i komentarze
            )];
      
            logger.info(`Loaded ${this.proxies.length} proxies from ${this.proxyFilePath}`);
      
            if (this.proxies.length === 0) {
                logger.warn(this.proxies);
                logger.warn('No valid proxies found in the proxy file');
            }
            this.usedProxies.clear();
            this.currentProxyIndex = 0; // reset indeksu po przeładowaniu

        } catch (error) {
            logger.error(`Failed to load proxy file: ${error.message}`);
            this.proxies = [];
            this.usedProxies.clear();
            this.currentProxyIndex = 0;
        }
    }

    getNextProxy() {
        if (this.isProxyless)  {logger.warn('No proxies available');  return undefined;}


        const proxy = this.proxies[this.currentProxyIndex];
        logger.debug(`Using proxy: ${mask(proxy)}`);

    
        this.currentProxyIndex = (this.currentProxyIndex + 1) % this.proxies.length; // (9 + 1) % 10 = 0
    
        return this.formatProxy(proxy);
    }
    getRandomProxy() {
        if (this.isProxyless)  {logger.warn('No proxies available');  return undefined;}


        if (this.usedProxies.size >= this.proxies.length) {
            this.usedProxies.clear();
        }

        const availableProxies = this.proxies.filter(proxy => !this.usedProxies.has(proxy));
    
        const proxyPool = availableProxies.length > 0 ? availableProxies : this.proxies;
    
        const randomIndex = Math.floor(Math.random() * proxyPool.length);
        const proxy = proxyPool[randomIndex];
    
        this.usedProxies.add(proxy);
    
        logger.debug(`Randomly selected proxy: ${mask(proxy)}`);
    
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