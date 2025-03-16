const getLogger = require('../utils/logger');
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
};
  
const createDataParser = (modelType) => {
    if (!parsingStrategies[modelType]) {
        throw new Error(`No parsing strategy defined for model: ${modelType}`);
    }
    
    return new DataParser(modelType, parsingStrategies[modelType]);
};

module.exports = createDataParser;
