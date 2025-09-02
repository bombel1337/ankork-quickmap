// src/services/parsers/nsaParser.js
const cheerio = require('cheerio');
const { getRowsNeededParsing } = require('../dPUtils');

const LABEL_MAP = {
    'Sygnatura': 'sygnatura',
    'Data orzeczenia': 'data_orzeczenia',
    'Data publikacji': 'data_publikacji',
    'Data wpływu': 'data_wplywu',
    'Sąd': 'sad',
    'Wydział': 'wydzial',
    'Sędziowie': 'sedziowie_raw',
    'Hasła tematyczne': 'hasla_tematyczne',
    'Skarżony organ': 'skarzony_organ',
    'Treść wyniku': 'tresc_wyniku',
    'Symbol z opisem': 'symbol_z_opisem',
    'Powołane przepisy': 'powolane_przepisy'
};

function textWithBrToLines($, el) {
    // zamień <br> na \n i weź 'goły' tekst
    const html = $(el).html() || '';
    return cheerio.load(`<div>${html}</div>`).text().replace(/\r/g, '').replace(/\n{2,}/g, '\n').trim();
}

function splitListLike(value) {
    if (!value) return [];
    // dzielenie po \n, średnikach, przecinkach – bez rozbijania dat typu "12, 34" w treści
    return value
        .split(/\n|;|(?<!\d),\s+/g)
        .map(s => s.trim())
        .filter(Boolean);
}

function parseJudges(raw) {
    const items = splitListLike(raw);
    return items.map(s => {
        // np. "Jan Kowalski /przewodniczący sprawozdawca/"
        const m = s.match(/^(.*?)(?:\s*\/\s*([^/]+)\s*\/\s*)?$/u);
        const name = (m?.[1] || s).trim().replace(/\s{2,}/g, ' ');
        const role = (m?.[2] || '').trim();
        return { name, role: role || null };
    });
}

function parseSymbols(raw) {
    const items = splitListLike(raw);
    // próbujemy złapać wiodący kod (3–4 cyfry), reszta jako opis
    return items.map(s => {
        const m = s.match(/^\s*(\d{3,4})\s*(.*)$/);
        return m ? { code: m[1], opis: m[2].trim() || null } : { code: null, opis: s };
    });
}

function extractInfoList($) {
    const out = {};
    $('.info-list, table.info-list').each((_, tbl) => {
        $(tbl).find('tr').each((__, tr) => {
            const label = $(tr).find('.info-list-label, td:first-child, th:first-child').first().text().trim();
            const key = LABEL_MAP[label];
            if (!key) return;
            const valCell = $(tr).find('.info-list-value, td:last-child').first();
            const value = textWithBrToLines($, valCell);
            if (!value) return;
            if (key in out && out[key]) {
                // jeśli wielokrotnie, łączymy z nową linią
                out[key] = `${out[key]}\n${value}`;
            } else {
                out[key] = value;
            }
        });
    });
    return out;
}

function extractSections($) {
    const bodyText = $('body').text().replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

    // Prosty heurystyczny rozdzielacz na podstawie nagłówków
    const sentIdx = bodyText.search(/\bSENTENCJA\b|\bSentencja\b/u);
    const uzasIdx = bodyText.search(/\bUZASADNIENIE\b|\bUzasadnienie\b/u);

    let sentencja = '';
    let uzasadnienie = '';

    if (sentIdx !== -1 && uzasIdx !== -1) {
        if (sentIdx < uzasIdx) {
            sentencja = bodyText.slice(sentIdx, uzasIdx).trim();
            uzasadnienie = bodyText.slice(uzasIdx).trim();
        } else {
            // rzadkie – gdy "Uzasadnienie" pojawia się wcześniej
            uzasadnienie = bodyText.slice(uzasIdx, sentIdx).trim();
            sentencja = bodyText.slice(sentIdx).trim();
        }
    } else if (uzasIdx !== -1) {
        uzasadnienie = bodyText.slice(uzasIdx).trim();
    } else if (sentIdx !== -1) {
        sentencja = bodyText.slice(sentIdx).trim();
    }

    // Dodatkowa próba: czasem "Sentencja" jest w polu info-list – wtedy sekcja powyżej bywa pusta.
    if (!sentencja) {
        const ilSent = $('.info-list-label:contains("Sentencja")').closest('tr').find('.info-list-value');
        if (ilSent.length) {
            sentencja = textWithBrToLines($, ilSent);
        }
    }

    return { sentencja, uzasadnienie };
}

function normalizeJoined(list) {
    if (!list || !list.length) return null;
    return list.join(' | ');
}

async function saveDataToDatabase(database, parsed, logger) {
    const conn = await database.pool.getConnection();
    await conn.beginTransaction();
    try {
        // UWAGA: Twój DatabaseService i tak potrafi ALTER TABLE, ale tu robimy jeden INSERT/UPSERT jak w innych parserach
        const sql = `
            INSERT INTO parsed_data (
                id,
                sygnatura,
                data_orzeczenia,
                data_publikacji,
                data_wplywu,
                sad,
                wydzial,
                hasla_tematyczne,
                skarzony_organ,
                tresc_wyniku,
                sedziowie,             -- złączone nazwiska
                sedziowie_json,        -- pełny JSON z rolami
                symbole,               -- złączone "kod opis"
                symbole_json,          -- JSON tablicy {code, opis}
                powolane_przepisy,     -- złączone
                sentencja,
                uzasadnienie,
                prawomocne,            -- z scraped_data
                uzasadnienie_flag,     -- z scraped_data
                link,
                tytul
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                sygnatura = VALUES(sygnatura),
                data_orzeczenia = VALUES(data_orzeczenia),
                data_publikacji = VALUES(data_publikacji),
                data_wplywu = VALUES(data_wplywu),
                sad = VALUES(sad),
                wydzial = VALUES(wydzial),
                hasla_tematyczne = VALUES(hasla_tematyczne),
                skarzony_organ = VALUES(skarzony_organ),
                tresc_wyniku = VALUES(tresc_wyniku),
                sedziowie = VALUES(sedziowie),
                sedziowie_json = VALUES(sedziowie_json),
                symbole = VALUES(symbole),
                symbole_json = VALUES(symbole_json),
                powolane_przepisy = VALUES(powolane_przepisy),
                sentencja = VALUES(sentencja),
                uzasadnienie = VALUES(uzasadnienie),
                prawomocne = VALUES(prawomocne),
                uzasadnienie_flag = VALUES(uzasadnienie_flag),
                link = VALUES(link),
                tytul = VALUES(tytul)
        `;
        await conn.query(sql, [
            parsed.id,
            parsed.sygnatura || null,
            parsed.data_orzeczenia || null,
            parsed.data_publikacji || null,
            parsed.data_wplywu || null,
            parsed.sad || null,
            parsed.wydzial || null,
            parsed.hasla_tematyczne || null,
            parsed.skarzony_organ || null,
            parsed.tresc_wyniku || null,
            parsed.sedziowie_joined || null,
            parsed.sedziowie_json || null,
            parsed.symbole_joined || null,
            parsed.symbole_json || null,
            parsed.powolane_przepisy || null,
            parsed.sentencja || null,
            parsed.uzasadnienie || null,
            parsed.prawomocne ?? null,
            parsed.uzasadnienie_flag ?? null,
            parsed.link || null,
            parsed.tytul || null
        ]);

        await conn.commit();
        logger.info(`NSA: zapisano parsed_data id=${parsed.id}`);
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

const nsaParser = async (database, logger) => {
    try {
        const rows = await getRowsNeededParsing(database);
        logger.info(`NSA parser: do przetworzenia wierszy: ${rows.length}`);
        for (const row of rows) {
            if (!row.link_html) {
                logger.warn(`NSA parser: brak link_html dla id=${row.id} (link=${row.link}) — pomijam`);
                continue;
            }
            const $ = cheerio.load(row.link_html);

            const info = extractInfoList($);

            // sędziowie
            const sedziowie = parseJudges(info.sedziowie_raw || '');
            const sedziowieJoined = normalizeJoined(sedziowie.map(x => x.name + (x.role ? ` (${x.role})` : '')));

            // symbole
            const symbole = parseSymbols(info.symbol_z_opisem || '');
            const symboleJoined = normalizeJoined(symbole.map(s => s.code ? `${s.code}${s.opis ? ' ' + s.opis : ''}` : (s.opis || '')));

            // sekcje
            const { sentencja, uzasadnienie } = extractSections($);

            const parsed = {
                id: row.id,
                sygnatura: info.sygnatura || null,
                data_orzeczenia: info.data_orzeczenia || null,
                data_publikacji: info.data_publikacji || null,
                data_wplywu: info.data_wplywu || null,
                sad: info.sad || null,
                wydzial: info.wydzial || null,
                hasla_tematyczne: info.hasla_tematyczne || null,
                skarzony_organ: info.skarzony_organ || null,
                tresc_wyniku: info.tresc_wyniku || null,
                powolane_przepisy: info.powolane_przepisy || null,

                sedziowie_joined: sedziowieJoined,
                sedziowie_json: JSON.stringify(sedziowie),

                symbole_joined: symboleJoined,
                symbole_json: JSON.stringify(symbole),

                sentencja,
                uzasadnienie,

                prawomocne: row.prawomocne ?? null,
                uzasadnienie_flag: row.uzasadnienie ?? null,

                link: row.link || null,
                tytul: row.title || null
            };

            await saveDataToDatabase(database, parsed, logger);
        }
        logger.info('NSA parser: zakończono.');
    } catch (error) {
        logger.error('nsaParser error:', error);
    }
};

module.exports = {
    nsaParser,
};
