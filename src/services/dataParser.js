const getLogger = require('../utils/logger');
const { msParser } = require('./parsers/msParser');
const { snParser } = require('./parsers/snParser');
const { uzpParser } = require('./parsers/uzpParser');


class DataParser {
    constructor(modelType, parsingStrategy) {
        this.modelType = modelType;
        this.parsingStrategy = parsingStrategy;
        this.logger = getLogger('data-parser');
    }
    
    async parse(database) {
        return await this.parsingStrategy(database, this.logger);
    }
}

const parsingStrategies = {
    uzp: async (database, logger) => {
        if (!database) return null;
        return await uzpParser(database, logger);
    },
    sn: async (database, logger) => {
        if (!database) return null;
        return await snParser(database, logger);
    },
    ms: async (database, logger) => {
        if (!database) return null;
        return await msParser(database, logger);
    },
};
  
const createDataParser = (modelType) => {
    if (!parsingStrategies[modelType]) {
        throw new Error(`No parsing strategy defined for model: ${modelType}`);
    }
    
    return new DataParser(modelType, parsingStrategies[modelType]);
};


const getRowsNeededParsing = async (database) => {
    try {
        const query = `
        SELECT * FROM scraped_data 
        WHERE status_code = 200 
        AND id NOT IN (SELECT id FROM parsed_data) ORDER BY id ASC
      `;    
    
        const [rows] = await database.pool.query(query);
        return rows;        
    } catch (error) {
        throw new Error(`getRowsNeededParsing: ${error.message}`);
    }

};

module.exports = {
    createDataParser,
    getRowsNeededParsing
};