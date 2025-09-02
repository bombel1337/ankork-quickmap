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
  

    async insertData(table, data, uniqueKey = null) {
        try {
            for (const key in data) {
                if (key === 'item_sid') continue;
                const [columns] = await this.pool.query('SHOW COLUMNS FROM ?? LIKE ?', [table, key]);

                if (columns.length === 0) {
                    const columnType = typeof data[key] === 'string' ? 'LONGTEXT' : 'INT';
    
                    await this.pool.query(
                        `ALTER TABLE ?? ADD COLUMN ?? ${columnType}`,
                        [table, key]
                    );
    
                    logger.info(`Database: ${this.database} Added column ${key} (${columnType}) to table ${table}`);
                }
            }
            if (uniqueKey && data[uniqueKey] != null) {
                const keys = Object.keys(data);
                const cols = keys.map(() => '??').join(', ');
                const vals = keys.map(() => '?').join(', ');

                const updateKeys = keys.filter(k => k !== uniqueKey);
                const updates = updateKeys.map(() => '?? = VALUES(??)').join(', ');

                const params = [
                    table,
                    ...keys,                                  // columns for (??)
                    ...keys.map(k => data[k]),                // values for (?)
                    ...updateKeys.flatMap(k => [k, k])        // col + col for (??=VALUES(??))
                ];

                await this.pool.query(
                    `INSERT INTO ?? (${cols}) VALUES (${vals}) ON DUPLICATE KEY UPDATE ${updates}`,
                    params
                );
                logger.info(`Database: ${this.database} upserted by ${uniqueKey} into ${table}`);
                return;
            }
            const largestId = await this.getLargestId(table, 'id');
            data.id = largestId + 1;
            await this.pool.query('INSERT INTO ?? SET ?', [table, data]);
            logger.info(`Database: ${this.database} data inserted successfully into ${table}, index: ${data.id}`);
        } catch (error) {
            logger.error(`Database: ${this.database} Error inserting data into ${table}: ${error.message}`);
            throw new Error(`Database: ${this.database} insertData error: ${error.message}`);
        }
    }
    
    async updateData(table, data, uniqueKey, uniqueKeyValue) {
        try {
            // Remove the unique key from the data object to avoid updating it
            const updateData = { ...data };
            delete updateData[uniqueKey];

            if (Object.keys(updateData).length === 0) {
                logger.warn(`Database: ${this.database} No data provided to update for ${uniqueKey}=${uniqueKeyValue} in table ${table}.`);
                return;
            }

            const [result] = await this.pool.query(
                'UPDATE ?? SET ? WHERE ?? = ?',
                [table, updateData, uniqueKey, uniqueKeyValue]
            );

            if (result.affectedRows > 0) {
                logger.info(`Database: ${this.database} data updated successfully in ${table} for ${uniqueKey}=${uniqueKeyValue}`);
            } else {
                logger.warn(`Database: ${this.database} No record found or updated in ${table} for ${uniqueKey}=${uniqueKeyValue}`);
            }
        } catch (error) {
            logger.error(`Database: ${this.database} Error updating data in ${table} for ${uniqueKey}=${uniqueKeyValue}: ${error.message}`);
            throw new Error(`Database: ${this.database} updateData error: ${error.message}`);
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
  
    async query(sql, params) {
        try {
            const [results] = await this.pool.query(sql, params);
            return results;
        } catch (error) {
            logger.error(`Database: ${this.database} Error executing query: ${error.message}`);
            throw new Error(`Database: ${this.database} query error: ${error.message}`);
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


