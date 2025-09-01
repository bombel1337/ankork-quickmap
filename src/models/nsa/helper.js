const getLogger = require('../../utils/logger');
const logger = getLogger('nsa-helper');  
const cheerio = require('cheerio');
const fs = require('fs');


class NsaHelper {
    static getTodaysDate() {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        
        return `${year}-${month}-${day}`;
    }
    static extractMaxPage(html) {
        try {
            const $ = cheerio.load(html);
            // Select all anchor elements within pagination that contain a page number
            const pageNumbers = $('.pagination li a')
                .map((i, el) => {
                    const text = $(el).text().trim();
                    const num = parseInt(text, 10);
                    return isNaN(num) ? null : num;
                })
                .get()
                .filter(num => num !== null);
            
            $('.pagination li.currentpage').each((i, el) => {
                const num = parseInt($(el).text().trim(), 10);
                if (!isNaN(num)) pageNumbers.push(num);
            });
            
            const maxPage = Math.max(...pageNumbers);
            logger.debug(`Extracted max page: ${maxPage}`);
            return maxPage;
        } catch (error) {
            throw new Error(`NsaHelper extractCourtCases: ${error.message}`);
        }
    }
    static saveResultsToCsv(results, currentPage, dateSpan, filePath = 'results.csv') {
        try {
            let rows = '';
            results.forEach(result => {
                const link = result.href || '';
                const title = result.title || '';
                const date = title.split(' ').pop();
                const number = result.number || '';
                rows += `"${link}","${title}","${date}","${dateSpan}","${currentPage}","${number}"\n`;
            });
            
            if (!fs.existsSync(filePath)) {
                fs.writeFileSync(filePath, 'link,title,date,date span,page,number\n', 'utf8');
            }
            fs.appendFileSync(filePath, rows, 'utf8');
            logger.info(`Saved ${results.length} rows to CSV file: ${filePath}`);
        } catch (error) {
            logger.error(`NsaHelper saveResultsToCsv: ${error.message}`);
            throw new Error(`NsaHelper saveResultsToCsv: ${error.message}`);
        }
    }
    static extractElements(html) {
        try {
            const $ = cheerio.load(html);
            const elements = [];

            $('#res-div table.info-list').each((i, table) => {
                const firstAnchor = $(table).find('tbody a').first();
                const href = firstAnchor.attr('href');
                const title = firstAnchor.text().trim();
                const date = title.split(' ').pop() || '';
                elements.push({
                    number: i+1,
                    href,
                    title,
                    date
                });
                
            });
            logger.debug(`Extracted ${elements.length} elements.`);
            return elements;
        } catch (error) {
            logger.error(`NsaHelper extractElements: ${error.message}`);
            throw new Error(`NsaHelper extractElements: ${error.message}`);
        }
    }
    static createDateRanges = (startDate, todaysDate) => {
        try {
            const today = new Date(todaysDate);
            const start = new Date(startDate);
            const ranges = [];
          
            let currentStart = new Date(start);
          
            while (currentStart < today) {
                // Create end date exactly 7 days from start date
                const currentEnd = new Date(currentStart);
                currentEnd.setDate(currentEnd.getDate() + 7);
            
                const endDate = currentEnd > today ? today : currentEnd;
            
                ranges.push({
                    fromDate: currentStart.toISOString().split('T')[0],
                    toDate: endDate.toISOString().split('T')[0]
                });
            
                currentStart = new Date(currentEnd);
                currentStart.setDate(currentStart.getDate() + 1);
            }
          
            return ranges;           
        } catch (error) {
            throw new Error(`NsaHelper createDateRanges: ${error.message}`);
        }
    };
    

}

module.exports = NsaHelper;