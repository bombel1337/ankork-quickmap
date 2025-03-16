
const getLogger = require('../../utils/logger');
const logger = getLogger('sn-helper');  
const cheerio = require('cheerio');

class SnHelper {
    static checkForErrorMessage(html, date) {
        try {
          const $ = cheerio.load(html);
          
          const errorDiv = $('div.ErrorMSG');
          
          if (errorDiv.length > 0) {
            const error = errorDiv.text().trim();
            logger.warn(`'found error div with text:'${error}' for date: ${date}`);
            return error;
          }
          
          return null;
        } catch (error) {
          throw new Error(`snHelper checkForErrorMessage: ${error.message}`);
        }
      }
    static createDateIterator(startDate, endDate = null) {
        if (endDate === null) {
            endDate = new Date(this.getTodaysDate());
        }
        
        const currentDate = startDate instanceof Date ? new Date(startDate) : new Date(startDate);
        const finalDate = endDate instanceof Date ? new Date(endDate) : new Date(endDate);
        
        return function getNextDate(increment = 1) {
            if (currentDate > finalDate) {
                logger.debug('Date iterator reached end date');
                return null;
            }
            
            const year = currentDate.getFullYear();
            const month = String(currentDate.getMonth() + 1).padStart(2, '0');
            const day = String(currentDate.getDate()).padStart(2, '0');
            const formattedDate = `${year}-${month}-${day}`;
            
            logger.debug(`getNextDate: ${formattedDate}`);
            
            currentDate.setDate(currentDate.getDate() + increment);
            
            return formattedDate;
        };
    }
    static getTodaysDate() {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        
        return `${year}-${month}-${day}`;
    }
}

module.exports = SnHelper;