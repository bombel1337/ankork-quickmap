const Database = require('./config/database');
const { CookieJar } = require('tough-cookie');
const ProxyManager = require('./services/proxyManager');

const config = {
  runMode: 'tests',
  useDatabase: true,
  abortOnFailure: false,
  database: null,
  cookieJar: new CookieJar(),
  delay: 3000,
  timeout: 10000,
  maxRetries: 5,
  retryDelay: 5000,
  saveResults: true,

  proxies: {
    enabled: true,
    rotate: 'random' // 'random' or 'sequential'
  },

  proxyManager: null,

  models: { uzp: true },

};

const modelsConfig = {
  uzp: {
    delay: 100,
    pages: -1,
    date: { since: '01-01-2025', to: '31-12-2025' }
  }
}

if (config.useDatabase) {
  config.database = new Database();
}

if (config.proxies.enabled) {
  config.proxyManager = new ProxyManager();
}


const mergeModelConfig = () => {
  Object.keys(config.models).forEach((modelKey) => {
    // Check if the model is enabled in config and exists in modelsConfig
    if (config.models[modelKey] && modelsConfig[modelKey]) {
      const modelData = modelsConfig[modelKey];
      
      // Merge the model config with the global config
      Object.keys(modelData).forEach((key) => {
        // If the key doesn't exist in config, add it from model data
        if (!(key in config)) {
          config[key] = modelData[key];
        } else {
          // If key exists, just ensure the value in the config stays the same
          if (config[key] === undefined) {
            config[key] = modelData[key];
          }
        }
      });
    }
  });
};

mergeModelConfig();

module.exports = config;

