const mysql = require('mysql2/promise');
const getLogger = require('../utils/logger');
const logger = getLogger('database');  

require('dotenv').config();



class DatabaseService {
    constructor(site) {
        this.database = site;
        this.pool = null;
    }

    async initialize() {
        try {
            this.pool = mysql.createPool({
                host: process.env.DB_HOST || 'localhost',
                user: process.env.DB_USER || 'root',
                password: process.env.DB_PASSWORD || '',
                database: this.database,
                charset: 'utf8mb4'
            });

            logger.info(`Database: ${this.database} connection pool initialized`);
        } catch (error) {
            logger.error(`Database: ${this.database} initialization error: ${error.message}`);
            throw new Error(`database: ${this.database} initialization: ${error.message}`);
        }
    }
  

    async insertData(table, data) {
        try {
            // Manually compute the next id.
            const largestId = await this.getLargestId(table);
            const nextId = largestId + 1;
            data.id = nextId;  // Provide the id value explicitly.

            // For each key (except 'id'), ensure a corresponding column exists.
            for (const key in data) {
                if (key === 'id') continue; // Skip 'id'
                const [columns] = await this.pool.query(
                    'SHOW COLUMNS FROM ?? LIKE ?', 
                    [table, key]
                );
                if (columns.length === 0) {
                    const columnType = typeof data[key] === 'string' ? 'LONGTEXT' : 'INT';

                    await this.pool.query(
                        `ALTER TABLE ?? ADD COLUMN ?? ${columnType}`,
                        [table, key]
                    );

                    logger.info(`Database: ${this.database} Added column ${key} (${columnType}) to table ${table}`);
                }
            }

            await this.pool.query('INSERT INTO ?? SET ?', [table, data]);
            logger.info(`Database: ${this.database} data inserted successfully into ${table}, index: ${nextId}`);
        } catch (error) {
            logger.error(`Database: ${this.database} Error inserting data into ${table}: ${error.message}`);
            throw new Error(`Database: ${this.database} insertData error: ${error.message}`);
        }
    }
  
    async getLargestId(table) {
        try {
            let query = `
        SELECT MAX(id) AS largest_id FROM ${table}
      `;

            const [rows] = await this.pool.query(query);

            const largest_id = rows[0].largest_id ?? 0;

            return largest_id;      
        } catch (error) {
            throw new Error(`Database: ${this.database} getLargestId: ${error.message}`);
        }
    }
  
    async close() {
        if (this.pool) {
            logger.info(`Closing database: ${this.database} connection pool`);
            await this.pool.end();
        }
    }
}

module.exports = DatabaseService;


