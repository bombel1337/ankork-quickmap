const cheerio = require('cheerio');
const { getRowsNeededParsing, sleep } = require('../dPUtils');

const extractData = (htmlContent) => {
    const $ = cheerio.load(htmlContent);
    const data = {
        name: null,
        addresses: [],
        dataWpisu: null,
        numerWpisu: null,
        telefon: null,
        www: null,
        email: null,
    };
  
    // Extract name
    data.name = $('.concept-heading__adviser-title').text().trim();
  
    // Extract addresses - find all paragraphs in adviser-data that don't contain "Data wpisu" or "Numer wpisu"
    $('.concept-heading__adviser-data p').each((i, elem) => {
        const text = $(elem).text().trim();
        // Skip paragraphs with "Data wpisu" or "Numer wpisu"
        if (!text.includes('Data wpisu') && !text.includes('Numer wpisu')) {
        // Split the address into lines
            const addressLines = text.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);
        
            if (addressLines.length > 0) {
                const address = addressLines.join(', ');
                if (data.addresses.includes(address)) {
                    return; 
                }
                data.addresses.push(address);

            }
        }
    });
  
    // Extract Data wpisu
    const dataWpisuElem = $('.concept-heading__adviser-data p:contains("Data wpisu")');
    if (dataWpisuElem.length > 0) {
        data.dataWpisu = dataWpisuElem.text()
            .replace('Data wpisu', '')
            .trim();
    }


  
    // Extract Numer wpisu
    const numerWpisuElem = $('.concept-heading__adviser-data p:contains("Numer wpisu")');
    if (numerWpisuElem.length > 0) {
        data.numerWpisu = numerWpisuElem.text()
            .replace('Numer wpisu', '')
            .trim();
    }
  
    // Extract telefon
    const telefonElem = $('.concept-heading__adviser-contact-item:contains("Telefon") a');
    if (telefonElem.length > 0) {
        data.telefon = telefonElem.text().trim();
    }
  
    // Extract WWW
    const wwwElem = $('.concept-heading__adviser-contact-item:contains("WWW") a');
    if (wwwElem.length > 0) {
        data.www = wwwElem.text().trim();
    }
    const email = $('.concept-heading__adviser-contact-item:contains("E-mail") a');
    if (email.length > 0) {
        data.email = email.text().trim();
    }
  
    return data;
};
  
const saveDataToDatabase = async (database, parsedData, logger) => {
    const connection = await database.pool.getConnection();
    await connection.beginTransaction();
    
    try {
        const insertQuery = `
            INSERT INTO parsed_data (
                id,
                advisor_url,
                imie_nazwisko,
                data_wpisu,
                numer_wpisu,
                telefon,
                email,
                adres,
                strona_http,
                page_link,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE
                advisor_url = VALUES(advisor_url),
                imie_nazwisko = VALUES(imie_nazwisko),
                data_wpisu = VALUES(data_wpisu),
                numer_wpisu = VALUES(numer_wpisu),
                telefon = VALUES(telefon),
                email = VALUES(email),
                adres = VALUES(adres),
                strona_http = VALUES(strona_http),
                page_link = VALUES(page_link),
                created_at = NOW()
        `;
        
        await connection.query(insertQuery, [
            parsedData.id,
            parsedData.advisor_url,
            parsedData.imie_nazwisko,
            parsedData.data_wpisu,
            parsedData.numer_wpisu,
            parsedData.telefon,
            parsedData.email,
            parsedData.adres,
            parsedData.strona_http,
            parsedData.page_link,
        ]);
        
        await connection.commit();
        logger.log(`Successfully saved data for ID: ${parsedData.id}`);
        return true;
        
    } catch (error) {
        await connection.rollback();
        logger.error(`Error saving data for ID: ${parsedData.id}:`, error);
        throw error;
    } finally {
        connection.release();
    }
};


const kidpParser = async (database, logger) => {
    try {
        const rowsToUpdate = await getRowsNeededParsing(database);
        logger.log(`Found ${rowsToUpdate.length} rows to process`);
        for (const row of rowsToUpdate) {
            const extractedData = extractData(row.page_html);
            const parsedData = {
                id: row.id, 
                advisor_url: row.advisor_url,
                imie_nazwisko: extractedData.name,
                data_wpisu: extractedData.dataWpisu,
                numer_wpisu: extractedData.numerWpisu,
                telefon: extractedData.telefon,
                email: extractedData.email,
                adres: extractedData.addresses && extractedData.addresses.length > 0 ? extractedData.addresses.join(' | ') : null,
                strona_http: extractedData.www,
                page_link: row.page_link,
            };
            await saveDataToDatabase(database, parsedData, logger);
            logger.log(`Processed row ID: ${row.id}`);
        }
    } catch (error) {
        logger.error('msParser error:', error);
    }
    await sleep(60000);
    kidpParser(database, logger);
};




module.exports = {
    kidpParser,
};