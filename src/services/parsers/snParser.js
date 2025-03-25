const cheerio = require('cheerio');
const { getRowsNeededParsing, sleep } = require('../dPUtils');


const getOrCreateJudge = async (connection, judgeName) => {
    const [judges] = await connection.query(
        'SELECT id FROM sedziowie WHERE name = ?',
        [judgeName]
    );
    
    if (judges.length > 0) {
        return judges[0].id;
    } else {
        const [result] = await connection.query(
            'INSERT INTO sedziowie (name) VALUES (?)',
            [judgeName]
        );
        return result.insertId;
    }
};
const saveDataToDatabase = async (database, parsedData, judges) => {
    const connection = await database.pool.getConnection();
    await connection.beginTransaction();
    
    try {
        const insertQuery = `
        INSERT INTO parsed_data 
        (id, sygnatura, forma_orzeczenia, data_wydania, izba, typ_skladu_sedziow, 
        przewodniczacy_skladu, sprawozdawca, autor_uzasadnienia, jednostka_obslugujaca, 
        tresc_orzeczenia, uzasadnienie, zarzadzenie, wyrok, postanowienie, uchwala, item_sid, link_pdf, link_html, page_link)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
        sygnatura = VALUES(sygnatura),
        forma_orzeczenia = VALUES(forma_orzeczenia),
        data_wydania = VALUES(data_wydania),
        izba = VALUES(izba),
        typ_skladu_sedziow = VALUES(typ_skladu_sedziow),
        przewodniczacy_skladu = VALUES(przewodniczacy_skladu),
        sprawozdawca = VALUES(sprawozdawca),
        autor_uzasadnienia = VALUES(autor_uzasadnienia),
        jednostka_obslugujaca = VALUES(jednostka_obslugujaca),
        tresc_orzeczenia = VALUES(tresc_orzeczenia),
        uzasadnienie = VALUES(uzasadnienie),
        zarzadzenie = VALUES(zarzadzenie),
        wyrok = VALUES(wyrok),
        postanowienie = VALUES(postanowienie),
        uchwala = VALUES(uchwala),
        item_sid = VALUES(item_sid),
        link_pdf = VALUES(link_pdf),
        link_html = VALUES(link_html),
        page_link = VALUES(page_link)
    `;
            
        await connection.query(insertQuery, [
            parsedData.id,
            parsedData.sygnatura,
            parsedData.forma_orzeczenia,
            parsedData.data_wydania,
            parsedData.izba,
            parsedData.typ_skladu_sedziow,
            parsedData.przewodniczacy_skladu,
            parsedData.sprawozdawca,
            parsedData.autor_uzasadnienia,
            parsedData.jednostka_obslugujaca,
            parsedData.tresc_orzeczenia,
            parsedData.uzasadnienie,
            parsedData.zarzadzenie,
            parsedData.wyrok,
            parsedData.postanowienie,
            parsedData.uchwala,
            parsedData.item_sid,
            parsedData.link_pdf,
            parsedData.link_html,
            parsedData.page_link,
              
        ]);
    
        
        // Handle judge relationships
        for (const judgeName of judges) {
            // Get or create judge (similar to your getOrCreateArticle)
            const judgeId = await getOrCreateJudge(connection, judgeName);
            
            // Create relationship
            await connection.query(
                'INSERT IGNORE INTO orzeczenia_sedziowie (orzeczenie_sid, sedzia_id) VALUES (?, ?)',
                [parsedData.id, judgeId]
            );
        }
        
        // Commit the transaction
        await connection.commit();
        return true;
        
    } catch (error) {
        // Rollback in case of error
        await connection.rollback();
        throw error;
    } finally {
        // Release the connection
        connection.release();
    }
};
const extractDataFromHtml = ($) => {
    const parsedData = {
        sygnatura: $('.page-form--cell:contains("Sygnatura sprawy") .page-form--field').text().trim(),
        forma_orzeczenia: $('.page-form--cell:contains("Forma orzeczenia") .page-form--field').text().trim(),
        data_wydania: $('.page-form--cell:contains("Data wydania") .page-form--field').text().trim(),
        izba: $('.page-form--cell:contains("Izby") .page-form--field').text().trim().replace('przejdź do danych teleadresowych dla ', ''),
        typ_skladu_sedziow: $('.page-form--cell:contains("Typ składu sędziów") .page-form--field').text().trim(),
        przewodniczacy_skladu: $('.page-form--cell:contains("Przewodniczący składu") .page-form--field').text().trim(),
        sprawozdawca: $('.page-form--cell:contains("Sprawozdawca") .page-form--field').text().trim(),
        autor_uzasadnienia: $('.page-form--cell:contains("Autor uzasadnienia") .page-form--field').text().trim(),
        jednostka_obslugujaca: $('.page-form--cell:contains("Jednostka obsługująca") .page-form--field').text().trim(),
        sklad_sedziow: $('.page-form--cell:contains("Skład sędziów") .page-form--field').text().trim(),
        link_pdf: $('.page-form--field a[href$=".pdf"]').attr('href') || null,
        link_html: $('.page-form--field a[href$=".html"]').attr('href') || null
    };
    if (parsedData.link_html && parsedData.link_html.startsWith('/')) {
        parsedData.link_html = `https://www.sn.pl${parsedData.link_html}`;
    }
    return parsedData;
};
    




const extractJudgmentText = (htmlContent) => {
    const $ = cheerio.load(htmlContent);
    
    const fullText = $('body').text().trim();

    const titleElement = $('.pt-Dokumenttytulorzeczenia18').text().trim();
    const hasUzasadnienie = $('.pt-Dokumentpodstawowykapitaliki').text().trim() === 'UZASADNIENIE';

    let zarzadzenie = '', uzasadnienie = '', wyrok = '', postanowienie = '', uchwala = '';
    let tresc_orzeczenia = fullText;

    if (titleElement === 'ZARZĄDZENIE' && hasUzasadnienie) {
        const uzasadnienieIndex = fullText.indexOf('UZASADNIENIE');
        if (uzasadnienieIndex !== -1) {
            zarzadzenie = fullText.substring(0, uzasadnienieIndex).trim();
            uzasadnienie = fullText.substring(uzasadnienieIndex).trim();
        }

    } else if (titleElement === 'ZARZĄDZENIE') {
        zarzadzenie = fullText;
    } else if (titleElement === 'WYROK') {
        wyrok = fullText;
    } else if (titleElement === 'POSTANOWIENIE') {
        postanowienie = fullText;
    } else if (titleElement === 'UCHWAŁA') {
        uchwala = fullText;
    }

    return { tresc_orzeczenia, zarzadzenie, uzasadnienie, wyrok, postanowienie, uchwala };
};



const extractJudges = (skladSedziow) => {

    if (!skladSedziow) return [];
    return skladSedziow.split(';')
        .map(judge => judge.trim())
        .filter(judge => judge !== '');
};

const snParser = async (database, logger) => {
    try {
        logger.log('snParser init');
        const rowsToProcess = await getRowsNeededParsing(database);
        logger.log(`Found ${rowsToProcess.length} rows to process`);
        
        for (const row of rowsToProcess) {
            const $ = cheerio.load(row.page_html);
            
            const parsedData = extractDataFromHtml($);

            
            const { tresc_orzeczenia, zarzadzenie, uzasadnienie, wyrok, postanowienie, uchwala } = extractJudgmentText(row.judgment_html);
            parsedData.zarzadzenie = zarzadzenie;
            parsedData.uzasadnienie = uzasadnienie;
            parsedData.tresc_orzeczenia = tresc_orzeczenia;
            parsedData.wyrok = wyrok;
            parsedData.postanowienie = postanowienie;
            parsedData.uchwala = uchwala;

            parsedData.page_link = row.page_link;
            parsedData.item_sid = row.item_sid;
            parsedData.id = row.id;
            const judges = extractJudges(parsedData.sklad_sedziow);
            
            await saveDataToDatabase(database, parsedData, judges);
            
            logger.log(`Processed row ID: ${row.id}`);
        }
        
        logger.log('snParser completed successfully');
    } catch (error) {
        logger.error('snParser error:', error);
        throw error;
    }
    await sleep(60000);
    snParser(database, logger);
};



module.exports = {
    snParser,
};