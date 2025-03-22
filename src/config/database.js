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
            // Now get the largest ID from the idx column instead of item_sid
            const largestId = await this.getLargestId(table, 'id'); 
            const nextId = largestId + 1;
            
            data.id = nextId;
            
            
            for (const key in data) {
                if (key === 'item_sid') continue;
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
    
    async getLargestId(table, column = 'id') {
        try {
            const [results] = await this.pool.query(
                'SELECT MAX(??) as maxId FROM ??',
                [column, table]
            );
            return results[0].maxId || 0;
        } catch (error) {
            logger.error(`Database: ${this.database} Error getting largest ID: ${error.message}`);
            return 0;
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


