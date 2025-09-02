
const getLogger = require('../../utils/logger');
const logger = getLogger('sn-helper');  
const cheerio = require('cheerio');

class SnHelper {
    static formatPolishDate(dateString) {
        const [year, month, day] = dateString.split('-');
        const polishMonths = {
            '01': 'stycznia',
            '02': 'lutego',
            '03': 'marca',
            '04': 'kwietnia',
            '05': 'maja',
            '06': 'czerwca',
            '07': 'lipca',
            '08': 'sierpnia',
            '09': 'września',
            '10': 'października',
            '11': 'listopada',
            '12': 'grudnia'
        };
        
        const dayWithoutLeadingZero = day.replace(/^0+/, '');
        
        return `${dayWithoutLeadingZero} ${polishMonths[month]} ${year}`;
    }
    static parseResults(html) {
        try {
            const $ = cheerio.load(html);
            const parseResults = [];
            
            $('.wyniki li.Items').each((index, element) => {
                const $element = $(element);
                
                const caseLink = $element.find('h3 a').attr('href');
                const caseNumber = $element.find('h3 a').text().trim();
                
                const url = new URL(caseLink);
                const itemSid = url.searchParams.get('ItemSID');
                
                const judgmentLink = $element.find('div.Download a').filter((i, el) => {
                    return $(el).text().includes('treść orzeczenia w wersji HTML');
                }).attr('href').replace('http:','https:');
                
                parseResults.push({
                    caseNumber,
                    caseLink: caseLink.includes('&DataWDniu=') 
                        ? caseLink.substring(0, caseLink.indexOf('&DataWDniu=')) 
                        : caseLink,
                    judgmentLink,
                    itemSid
                });
            });
            
            return parseResults;
        } catch (error) {
            logger.error(`snHelper parseResults: ${error.message}`);

            throw new Error(`snHelper parseResults: ${error.message}`);
        }
    }
    static isEmptySearch(html, date) {
        try {
            const $ = cheerio.load(html);
          
            const errorDiv = $('div.ErrorMSG');
          
            if (errorDiv.length > 0) {
                const error = errorDiv.text().trim();
                if (error === 'Nie znaleziono orzeczeń spełniających kryteria wyszukiwania') {
                    logger.log('Found empty search for: ', date);
                    return true;
                }
                throw new Error(`snHelper isEmptySearch: found error div with text: ${error} for date: ${date}`);
            }
          
            return false;
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