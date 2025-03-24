// const cheerio = require('cheerio');
const { getRowsNeededParsing } = require('../dPUtils');



const msParser = async (database, logger) => {
    try {
        const rowsToUpdate = await getRowsNeededParsing(database);
        logger.log(`Found ${rowsToUpdate.length} rows to process`);
        
        for (const row of rowsToUpdate) {

            
            logger.log(`Processed row ID: ${row.id}`);
        }
    } catch (error) {
        logger.error('msParser error:', error);
    }
};




module.exports = {
    msParser,
};