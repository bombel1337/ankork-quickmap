const mysql = require('mysql2/promise');
const getLogger = require('../utils/logger');

const logger = getLogger('database');  



class DatabaseService {
  constructor(config) {
    this.config = config;
    this.pool = null;
  }

  async initialize() {
    try {
      this.pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'notes_app',
      });
      
      logger.info('Database connection pool initialized');
    } catch (error) {
      logger.error(`Database initialization error: ${error.message}`);
      throw error;
    }
  }
  

  

  
  async getNotesApp() {
    try {
      let query = `
        SELECT * FROM notes
      `;
 
      const [rows] = await this.pool.query(query);
      return rows;
      
    } catch (error) {
      logger.error(`Error retrieving decisions: ${error.message}`);
      throw error;
    }
  }
  
  async close() {
    if (this.pool) {
      logger.info('Closing database connection pool');
      await this.pool.end();
    }
  }
}

module.exports = DatabaseService;


