const cheerio = require('cheerio');
const { getRowsNeededParsing } = require('../dPUtils');


async function getOrCreateArticle(database, articleReference) {
    // First, try to find the existing article
    const [existingArticles] = await database.pool.query(
        'SELECT id FROM articles WHERE article_reference = ?',
        [articleReference]
    );
    
    if (existingArticles.length > 0) {
        return existingArticles[0].id;
    }
    
    // If not found, insert the new article
    const [result] = await database.pool.query(
        'INSERT INTO articles (article_reference) VALUES (?)',
        [articleReference]
    );
    
    return result.insertId;
}
async function getOrCreateTopic(database, topicName) {
    // First, try to find the existing topic
    const [existingTopics] = await database.pool.query(
        'SELECT id FROM topics WHERE topic_name = ?',
        [topicName]
    );
    
    if (existingTopics.length > 0) {
        return existingTopics[0].id;
    }
    
    // If not found, insert the new topic
    const [result] = await database.pool.query(
        'INSERT INTO topics (topic_name) VALUES (?)',
        [topicName]
    );
    
    return result.insertId;
}
async function insertParsedData(database, parsedData, logger) {
    try {
        // Format the date before insertion
        const formattedDate = formatDate(parsedData['Data wydania rozstrzygnięcia']);
        let sygnatura = null;
        let sygnatura_decyzja = null;
        
        if (parsedData['Sygnatura akt / Sposób rozstrzygnięcia']) {
            const signatureText = parsedData['Sygnatura akt / Sposób rozstrzygnięcia'];
            // Try to split by common separators
            if (signatureText.includes('/')) {
                [sygnatura, sygnatura_decyzja] = signatureText.split(' / ', 2).map(s => s.trim());
            } else if (signatureText.includes('-')) {
                [sygnatura, sygnatura_decyzja] = signatureText.split(' - ', 2).map(s => s.trim());
            } else {
                // If no clear separator, just use the whole string as sygnatura
                sygnatura = signatureText.trim();
            }

        }
        // First insert/update the main parsed data
        const insertParsedQuery = `
  INSERT INTO parsed_data 
    (id, organ_wydajacy, rodzaj_dokumentu, data_wydania_rozstrzygniecia, przewodniczacy, zamawiajacy, miejscowosc, sygnatura, sygnatura_decyzja, tryb_postepowania, wyrok, uzasadnienie, data_wyroku, rok_wyroku,  rodzaj_zamowienia, page_link)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON DUPLICATE KEY UPDATE
    organ_wydajacy = VALUES(organ_wydajacy),
    rodzaj_dokumentu = VALUES(rodzaj_dokumentu),
    data_wydania_rozstrzygniecia = VALUES(data_wydania_rozstrzygniecia),
    przewodniczacy = VALUES(przewodniczacy),
    zamawiajacy = VALUES(zamawiajacy),
    miejscowosc = VALUES(miejscowosc), 
    sygnatura = VALUES(sygnatura),
    sygnatura_decyzja = VALUES(sygnatura_decyzja),
    tryb_postepowania = VALUES(tryb_postepowania),
    wyrok = VALUES(wyrok),
    uzasadnienie = VALUES(uzasadnienie),
    data_wyroku = VALUES(data_wyroku),
    rok_wyroku = VALUES(rok_wyroku),
    rodzaj_zamowienia = VALUES(rodzaj_zamowienia),
    page_link = VALUES(page_link)
`;
        
        await database.pool.query(insertParsedQuery, [
            parsedData.id,
            parsedData['Organ wydający'] || null,
            parsedData['Rodzaj dokumentu'] || null,
            formattedDate,
            parsedData['Przewodniczący'] || null,
            parsedData['Zamawiający'] || null,
            parsedData['Miejscowość'] || null,
            sygnatura,
            sygnatura_decyzja,
            parsedData['Tryb postępowania'] || null,
            parsedData['judgementCleared'] || null,
            parsedData['decisionCleared'] || null,
            parsedData['fullDate'] || null,
            parsedData['year'] || null,
            parsedData['Rodzaj zamówienia'] || null,
            parsedData['page_link'] || null,
        ]);
        
        // Get the parsed_data id we just inserted
        const parsedDataId = parsedData.id;
      
        // Insert each article and create links
        const kluczoweArticles = parsedData['Kluczowe przepisy ustawy Pzp'] || [];
        for (const article of kluczoweArticles) {
            try {
                // Get or create the article entry
                const articleId = await getOrCreateArticle(database, article);
                
                // Create a link between the parsed data and the article
                await database.pool.query(
                    'INSERT IGNORE INTO key_provisions (parsed_data_id, article_id) VALUES (?, ?)',
                    [parsedDataId, articleId]
                );
            } catch (error) {
                logger.error(`Error linking article: "${article}, Link: ${parsedData['page_link']} Error: ${error.message}`);
            }
        }
      
        // Insert each topic into the case_topics table.
        const zagadnieniaTopics = parsedData['Zagadnienia merytoryczne w odwołaniu z Indeksu tematycznego'] || [];
        for (const topic of zagadnieniaTopics) {
            try {
                // Get or create the topic entry
                const topicId = await getOrCreateTopic(database, topic);
                
                // Create a link between the parsed data and the topic
                await database.pool.query(
                    'INSERT IGNORE INTO case_topics (parsed_data_id, topic_id) VALUES (?, ?)',
                    [parsedDataId, topicId]
                );
            } catch (error) {
                logger.error(`Error linking topic "${topic}, Link: ${parsedData['page_link']} Error: ${error.message}`);
                // Continue with next topic even if this one fails
            }
        }
        
        return true;
    } catch (error) {
        throw new Error('insertParsedData error', error);
    }
}
// Add this function to update article descriptions when needed
// async function updateArticleDescription(database, articleReference, description) {
//     await database.pool.query(
//         'UPDATE articles SET description = ? WHERE article_reference = ?',
//         [description, articleReference]
//     );
// }

// // Function to get all articles with their descriptions
// async function getArticlesWithDescriptions(database) {
//     const [rows] = await database.pool.query(
//         'SELECT article_reference, description FROM articles ORDER BY article_reference'
//     );
//     return rows;
// }
function formatDate(dateString) {
    if (!dateString) return null;
    
    // Check if the date is in DD-MM-YYYY format
    const dateParts = dateString.match(/(\d{2})-(\d{2})-(\d{4})/);
    if (dateParts) {
        // Convert to YYYY-MM-DD
        return `${dateParts[3]}-${dateParts[2]}-${dateParts[1]}`;
    }
    
    return dateString; // Return as is if not in expected format
}

// async function getArticlesForParsedData(database, parsedDataId) {
//     const query = `
//         SELECT a.article_reference, a.description
//         FROM key_provisions k
//         JOIN articles a ON k.article_id = a.id
//         WHERE k.parsed_data_id = ?
//         ORDER BY a.article_reference
//     `;
    
//     const [rows] = await database.pool.query(query, [parsedDataId]);
//     return rows;
// }

// async function getTopicsForParsedData(database, parsedDataId) {
//     const query = `
//         SELECT t.topic_name, t.description
//         FROM case_topics z
//         JOIN topics t ON z.topic_id = t.id
//         WHERE z.parsed_data_id = ?
//         ORDER BY t.topic_name
//     `;
    
//     const [rows] = await database.pool.query(query, [parsedDataId]);
//     return rows;
// }

function parseDetailsMetrics(html) {
    const $ = cheerio.load(html);
    const result = {
        'Organ wydający': null,
        'Rodzaj dokumentu': null,
        'Data wydania rozstrzygnięcia': null,
        'Przewodniczący': null,
        'Zamawiający': null,
        'Miejscowość': null,
        'Sygnatura akt / Sposób rozstrzygnięcia': null,
        'Tryb postępowania': null,
        'Rodzaj zamówienia': null,
        'Kluczowe przepisy ustawy Pzp': [],
        'Zagadnienia merytoryczne w odwołaniu z Indeksu tematycznego': [],
    };
    
    // Parse the first section for the main fields
    $('.row .col-md-6').each((i, el) => {
        const labelEl = $(el).find('label').first();
        let label = labelEl.attr('for') || labelEl.attr('aria-label') || labelEl.text().trim();
      
        // Map the label to the correct property name
        const labelMap = {
            'Organ wydajÄ…cy': 'Organ wydający',
            'Metrics_DecisionType': 'Rodzaj dokumentu',
            'Metrics_IssueDate': 'Data wydania rozstrzygnięcia',
            'Chairman': 'Przewodniczący',
            'Purchaser': 'Zamawiający',
            'City': 'Miejscowość',
            'Procedure': 'Tryb postępowania',
            'ContractType': 'Rodzaj zamówienia'
        };
      
        if (labelMap[label]) {
            label = labelMap[label];
        }
      
        // Special case for sygnatura
        if (label.includes('Sygnatura')) {
            label = 'Sygnatura akt / Sposób rozstrzygnięcia';
            const value = $(el).find('ul li').text().trim();
            result[label] = value || null;
            return;
        }
      
        // Get the value (text after the label and <br> if present)
        let value = null;
        const pEl = $(el).find('p');
        if (pEl.length) {
        // Clone the p element and remove the label to isolate the value
            const pClone = pEl.clone();
            pClone.find('label, br').remove();
            value = pClone.text().trim() || null;
        }
      
        // Only update if our result object has this key
        if (Object.prototype.hasOwnProperty.call(result,label)) {
            result[label] = value;
        }
    });
    
    // Parse the sections for the lists
    $('div > b').each((i, el) => {
        const boldText = $(el).text().trim();
      
        if (boldText === 'Kluczowe przepisy ustawy Pzp') {
            $(el).next('p').find('a').each((i, a) => {
                const text = $(a).text().trim();
                if (text) {
                    result['Kluczowe przepisy ustawy Pzp'].push(text);
                }
            });
      
        } else if (boldText.includes('Zagadnienia merytoryczne')) {
            const p = $(el).next('p');
            p.find('a').each((i, a) => {
                const text = $(a).text().trim();
                if (text) {
                    result['Zagadnienia merytoryczne w odwołaniu z Indeksu tematycznego'].push(text);
                }
            });
        }
    });
  
    return result;
}


async function parseIFrame(row) {
    try {

        if (!row.iframe_html || !row.judgment_div || !row.decision_div) {
            return null;
        }
        
        const $ = cheerio.load(row.iframe_html);
        const judgment = cheerio.load(row.judgment_div);
        const decision = cheerio.load(row.decision_div);

        let fullDate = null;
        let year = null;
        
        $('span').each((i, el) => {
            let text = $(el).text().trim();
            if (text.includes('z dnia')) {
                // Use regex to find the date pattern after "z dnia"
                const dateMatch = text.match(/z dnia\s+([^]+?(\d{1,2}\s+\w+\s+\d{4}))/);
                if (dateMatch) {
                    fullDate = dateMatch[1].trim(); // Extracts the matched date part

                    const yearMatch = fullDate.match(/(\d{4})/);
                    if (yearMatch) {
                        year = yearMatch[1];
                    }
                    return false; // Exit loop after finding the date
                }
            }
        });

        return {
            fullDate,
            year,
            decisionCleared: decision.text(),
            judgementCleared: judgment.text()
        };
    } catch (error) {
        throw new Error('parseIFrame error ', error);
    }
}

const uzpParser = async (database, logger) => {
    try {
        const rowsToUpdate = await getRowsNeededParsing(database);
        for (const row of rowsToUpdate) {
            if (row.details_metrics) {
                const html = row.details_metrics;
                const parsedData = parseDetailsMetrics(html);
                const iFrameDAta = await parseIFrame(row);
                parsedData.fullDate = iFrameDAta?.fullDate ?? null;
                parsedData.year = iFrameDAta?.year ?? null;
                parsedData.decisionCleared = iFrameDAta?.decisionCleared ?? null;
                parsedData.judgementCleared = iFrameDAta?.judgementCleared ?? null;
                parsedData.page_link = row.page_link;

                await insertParsedData(database, {id: row.id, ...parsedData}, logger);


                // const articles = await getArticlesForParsedData(database, row.id);
                // const topics = await getTopicsForParsedData(database, row.id);
            }
        }
    } catch (error) {
        logger.error('uzpParser error:', error);
    }
};




module.exports = {
    uzpParser,
};