// dbUtils.js
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
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = {
    getRowsNeededParsing,
    sleep
};