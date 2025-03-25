const cheerio = require('cheerio');
const { getRowsNeededParsing } = require('../dPUtils');

const parseArticles = (html) => {
    const $ = cheerio.load(html);
    const articles = [];
    
    $('#regulations li').each((index, element) => {
        // Get the description (text content of the li element without the link text)
        const fullText = $(element).text().trim();
        const linkText = $(element).find('a').text().trim();
        const description = fullText.replace(linkText, '').trim();
      
        // Get the link
        const link = $(element).find('a').attr('href');
        let article_id = '';
        if (link) {
            const urlParams = new URL(link);
            article_id = urlParams.searchParams.get('id') || ''; // Gets the 'id' parameter from the URL
        }
        // Get the title (the text inside parentheses from the link text)
        const titleMatch = linkText.match(/\((.*?)\)/);
        const title = titleMatch ? titleMatch[1] : '';
      
        articles.push({
            article_id,
            description,
            link,
            title
        });
    });
    
    return articles;
};
const parseCaseDetails = (html) => {
    const $ = cheerio.load(html);
    const details = {};
    
    // Map of Polish terms to your specified field names
    const fieldMapping = {
        'Tytuł:': 'tytul',
        'Data orzeczenia:': 'data_orzeczenia',
        'Data publikacji:': 'data_publikacji',
        'Data uprawomocnienia:': 'data_uprawomocnienia',
        'Sygnatura:': 'sygnatura',
        'Sąd:': 'sad',
        'Wydział:': 'wydzial',
        'Przewodniczący:': 'przewodniczacy',
        'Protokolant:': 'protokolant',
        'Hasła tematyczne:': 'hasla_tematyczne',
        'Podstawa prawna:': 'podstawa_prawna'
    };
    
    // Extract each dt-dd pair
    $('.single_result dl dt').each((index, element) => {
        const key = $(element).text().trim();
        const mappedKey = fieldMapping[key];
        if (!mappedKey) {
            return; // Skip if key is not found in the mapping
        }
      
        // Get the next dd element
        const value = $(element).next('dd').text().trim();
      
        details[mappedKey] = value;
    });

    
    return details;
};

const parseH2Sections = (html) => {
    const $ = cheerio.load(html);
    const sections = {};
    const supportedHeaders = ['wyrok', 'uzasadnienie', 'zarzadzenie'];
    
    // Find all h2 tags
    const h2Tags = $('h2').toArray();
    
    // Process each h2 tag
    for (let i = 0; i < h2Tags.length; i++) {
        const currentH2 = $(h2Tags[i]);
        const headerText = currentH2.text().trim().toLowerCase();
      
        // Check if this is one of our supported headers
        const matchedHeader = supportedHeaders.find(header => headerText.includes(header));
        if (matchedHeader) {
            let sectionContent = '';
            let currentElement = currentH2.next();
        
            // Continue until we hit another h2 or the end of document
            while (currentElement.length > 0 && currentElement.prop('tagName') !== 'H2') {
                sectionContent += currentElement.toString();
                currentElement = currentElement.next();
            }
        
            // Clean the content - remove HTML tags if needed
            const cleanContent = $('<div>').html(sectionContent).text().trim();
        
            // Store the content under the appropriate key
            sections[matchedHeader] = cleanContent;
        }
    }
    
    return sections;
};
const getOrCreateArticle = async (connection, article) => {
    const [existingArticles] = await connection.query(
        'SELECT article_id FROM articles WHERE article_id = ?',
        [article.article_id]
    );
    
    if (existingArticles.length > 0) {
        return existingArticles[0].article_id;
    } else {
        await connection.query(
            'INSERT INTO articles (article_id, title, description, link) VALUES (?, ?, ?, ?)',
            [article.article_id, article.title, article.description, article.link]
        );
        // Return the provided article_id since that's what was inserted
        return article.article_id;
    }
};
const saveDataToDatabase = async (database, parsedData, articles, logger) => {
    const connection = await database.pool.getConnection();
    await connection.beginTransaction();
    
    try {
        const insertQuery = `
            INSERT INTO parsed_data 
            (id, tytul, data_orzeczenia, data_publikacji, sygnatura, sad, 
            wydzial, przewodniczacy, protokolant, hasla_tematyczne, 
            podstawa_prawna, wyrok, uzasadnienie, zarzadzenie, link)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            tytul = VALUES(tytul),
            data_orzeczenia = VALUES(data_orzeczenia),
            data_publikacji = VALUES(data_publikacji),
            sygnatura = VALUES(sygnatura),
            sad = VALUES(sad),
            wydzial = VALUES(wydzial),
            przewodniczacy = VALUES(przewodniczacy),
            protokolant = VALUES(protokolant),
            hasla_tematyczne = VALUES(hasla_tematyczne),
            podstawa_prawna = VALUES(podstawa_prawna),
            wyrok = VALUES(wyrok),
            uzasadnienie = VALUES(uzasadnienie),
            zarzadzenie = VALUES(zarzadzenie),
            link = VALUES(link)
        `;
        
        // Execute the query with all parsedData fields
        await connection.query(insertQuery, [
            parsedData.id,
            parsedData.tytul,
            parsedData.data_orzeczenia,
            parsedData.data_publikacji,
            parsedData.sygnatura,
            parsedData.sad,
            parsedData.wydzial,
            parsedData.przewodniczacy,
            parsedData.protokolant,
            parsedData.hasla_tematyczne,
            parsedData.podstawa_prawna,
            parsedData.wyrok,
            parsedData.uzasadnienie,
            parsedData.zarzadzenie,
            parsedData.link
        ]);
        // Handle article relationships
        for (const article of articles) {
            if (!article.article_id) { // skip if invalid or empty
                logger.warn('Skipping invalid article:', article);
                continue;
            }
            const articleId = await getOrCreateArticle(connection, article);

            await connection.query(
                'INSERT INTO articles_references (parsed_data_id, article_id) VALUES (?, ?)',
                [parsedData.id, articleId]
            );
            
        }
        
        await connection.commit();
        return true;
        
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

const msParser = async (database, logger) => {
    try {
        const rowsToUpdate = await getRowsNeededParsing(database);
        logger.log(`Found ${rowsToUpdate.length} rows to process`);
        
        for (const row of rowsToUpdate) {
            const articles = parseArticles(row.regulations_html);
            const caseDetails = parseCaseDetails(row.details_html);
            const h2Sections = parseH2Sections(row.judgment_html);

            const parsedData = {
                id: row.id, 
                ...caseDetails,
                ...h2Sections,
                link: row.details_link
            };
            await saveDataToDatabase(database, parsedData, articles, logger);
            logger.log(`Processed row ID: ${row.id}`);
        }
    } catch (error) {
        logger.error('msParser error:', error);
    }
};




module.exports = {
    msParser,
};