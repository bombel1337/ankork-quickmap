const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const DatabaseService = require('../config/database');
const { Sites } = require('../utils/constants');
const getLogger = require('../utils/logger');
require('dotenv').config();

const logger = getLogger('importNsaCsv');

// --- Configuration ---
// !!! IMPORTANT: Update this path to your actual CSV file !!!
const csvFilePath = path.resolve(__dirname, '../../results.csv'); 
const dbTable = 'scraped_data';
const uniqueColumn = 'link'; // Column used to check for duplicates
// ---------------------
async function isUnique(database, table, column, value) {
    const [rows] = await database.pool.query(
        'SELECT 1 FROM ?? WHERE ?? = ? LIMIT 1', [table, column, value]
    );
    return rows.length === 0;
}
const importData = async () => {
    logger.info(`Starting CSV import from: ${csvFilePath}`);

    if (!fs.existsSync(csvFilePath)) {
        logger.error(`CSV file not found at: ${csvFilePath}`);
        process.exit(1);
    }

    const database = new DatabaseService(Sites.orzeczenia_nsa_gov);
    let connectionInitialized = false;
    let rowsProcessed = 0;
    let rowsImported = 0;
    let rowsSkipped = 0;

    try {
        await database.initialize();
        connectionInitialized = true;
        logger.info(`Connected to database: ${database.database}`);

        const stream = fs.createReadStream(csvFilePath)
            .pipe(csv());

        for await (const row of stream) {
            rowsProcessed++;
            const link = row.link;
            const title = row.title;
            const date = row.date; 

            if (!link || !title || !date) {
                logger.warn(`Skipping row ${rowsProcessed}: Missing required data (link, title, or date)`);
                rowsSkipped++;
                continue;
            }

            // Basic validation for date format (YYYY-MM-DD)
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                logger.warn(`Skipping row ${rowsProcessed}: Invalid date format for '${date}'. Expected YYYY-MM-DD.`);
                rowsSkipped++;
                continue;
            }

            try {
                const dataToInsert = {
                    link: link, 
                    title: title,
                    date: date,
                    // Add other columns with default values if necessary
                    // e.g., status_code: null, prawomocne: null, uzasadnienie: null
                };

                // Check uniqueness before attempting insert
                const ok = await isUnique(database, dbTable, uniqueColumn, link);
                if (!ok) {
                    logger.info(`Skipping row ${rowsProcessed}: Link '${link}' already exists in ${dbTable}`);
                    rowsSkipped++;
                } else {
                    // We don't need insertData's unique check now, but we still use it for column creation and ID generation.
                    await database.insertData(dbTable, dataToInsert, null); 
                    rowsImported++;
                    if (rowsImported % 100 === 0) { // Log progress every 100 imports
                        logger.info(`Processed ${rowsProcessed} rows, Imported ${rowsImported} rows...`);
                    }
                }

            } catch (dbError) {
                logger.error(`Failed to insert row ${rowsProcessed} (Link: ${link}): ${dbError.message}`);
                rowsSkipped++; 
                // Decide if you want to stop on DB error or continue
                // throw dbError; // Uncomment to stop on first DB error
            }
        }

        logger.info('CSV file successfully processed.');
        logger.info(`Summary: Total Rows: ${rowsProcessed}, Imported: ${rowsImported}, Skipped: ${rowsSkipped}`);

    } catch (error) {
        logger.error(`An error occurred during the import process: ${error.message}`);
        if (error.code === 'ECONNREFUSED') {
            logger.error('Database connection refused. Ensure the database server is running and accessible.');
        }
    } finally {
        if (connectionInitialized && database) {
            await database.close();
            logger.info('Database connection closed.');
        }
    }
};

importData(); 