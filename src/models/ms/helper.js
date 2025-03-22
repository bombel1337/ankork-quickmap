
const getLogger = require('../../utils/logger');
const logger = getLogger('ms-helper');  
const cheerio = require('cheerio');

class MsHelper {
    static getDetails(html) {
        const $ = cheerio.load(html);
        return $('.pt-Dokumenttytulorzeczenia18').text().trim() ?? null;
    }
    static getLastPageNumber(html) {
        try {
            const $ = cheerio.load(html);
            
            // Check if pagination exists
            const pagination = $('.pagination');
            if (pagination.length === 0) {
                return 1; // If no pagination exists, assume we're on the only page
            }
            
            // Get all page links
            const pageLinks = $('.t-data-grid-pager a');
            let lastPage = 1;
            
            // Find the highest page number by examining all links
            pageLinks.each((_, link) => {
                const pageNum = parseInt($(link).text(), 10);
                if (!isNaN(pageNum) && pageNum > lastPage) {
                    lastPage = pageNum;
                }
            });
            
            return lastPage;
        } catch (error) {
            throw new Error(`PaginationHelper getLastPageNumber: ${error.message}`);
        }
    }
    static isLastPage(html) {
        try {
            const $ = cheerio.load(html);
            
            // Check if pagination exists
            const pagination = $('.pagination');
            if (pagination.length === 0) {
                // If no pagination exists, it's effectively the last page
                return true;
            }
            
            // Get current page number
            const currentPageElement = $('.t-data-grid-pager .current');
            const currentPage = currentPageElement.length > 0 ? parseInt(currentPageElement.text(), 10) : null;
            console.log(currentPageElement > 0, currentPageElement.text(), currentPage);
            if (currentPage === null) {
                return false; // Can't determine current page
            }
            
            // Get all page links
            const pageLinks = $('.t-data-grid-pager a');
            let maxPage = currentPage;
            
            // Find the highest page number
            pageLinks.each((_, link) => {
                const pageNum = parseInt($(link).text(), 10);
                if (!isNaN(pageNum) && pageNum > maxPage) {
                    maxPage = pageNum;
                }
            });
            
            // Return true if we're on the last page
            return currentPage >= maxPage;
        } catch (error) {
            throw new Error(`PaginationHelper isLastPage: ${error.message}`);
        }
    }
    static getResultsLength(html, date) {
        try {
            const $ = cheerio.load(html);
          
            const resultsLength = $('span.big_number');
          
            if (resultsLength.length === 0) {
                throw new Error(`MsHelper getResultsLength: found error not locating span.big_number for date: ${date}`);
            }
          
            const textValue = resultsLength.text();
            const parsedValue = parseInt(textValue, 10);
          
            if (isNaN(parsedValue)) {
                throw new Error(`MsHelper getResultsLength: unable to parse integer from "${textValue}" for date: ${date}`);
            }
          
            return parsedValue;
        } catch (error) {
            throw new Error(`MsHelper checkForErrorMessage: ${error.message}`);
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
    static extractCourtCases(html) {
        try {
            const $ = cheerio.load(html);
            const results = [];
            
            $('tr').each((index, element) => {
                const titleElement = $(element).find('h4 a');
                const title = titleElement.text().trim();
                const paragraphs = $(element).find('.title p');
                const firstParagraph = paragraphs.first().text().trim();
                const lastParagraph = paragraphs.last().text().trim();
                
                
                if (title) {
                    results.push({
                        title,
                        type: firstParagraph.split(',').map((item) => item.trim()),
                        isFinalJudgment: lastParagraph === 'Orzeczenie nieprawomocne' ? false : true,
                        link: titleElement.attr('href') || ''
                    });
                } 
            });
            
            logger.debug(`Extracted ${results.length} court cases`);
            return results;
        } catch (error) {
            throw new Error(`MsHelper extractCourtCases: ${error.message}`);
        }
    }
    static getTodaysDate() {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        
        return `${year}-${month}-${day}`;
    }
}

module.exports = MsHelper;