// src/services/parsers/nsaParser.js
const cheerio = require('cheerio');
const { getRowsNeededParsing } = require('../dPUtils');

const LABEL_MAP = {
    'Sygnatura': 'sygnatura',              // rzadko w tabeli – zwykle w nagłówku
    'Data orzeczenia': 'data_orzeczenia',
    'Data wpływu': 'data_wplywu',
    'Sąd': 'sad',
    'Sędziowie': 'sedziowie_raw',
    'Hasła tematyczne': 'hasla_tematyczne',
    'Skarżony organ': 'oskarzony_organ',
    'Treść wyniku': 'tresc_wyniku',
    'Symbol z opisem': 'symbol_z_opisem',
    'Powołane przepisy': 'powolane_przepisy',
};

function textWithBrToLines($, el) {
    const html = $(el).html() || '';
    return cheerio.load(`<div>${html}</div>`)('div')
        .text()
        .replace(/\r/g, '')
        .replace(/\u00A0/g, ' ')
        .replace(/\s+\n/g, '\n')
        .replace(/\n{2,}/g, '\n')
        .trim();
}

function splitListLike(value) {
    if (!value) return [];
    return value
        .split(/\n|;|(?<!\d),\s+/g)
        .map(s => s.trim())
        .filter(Boolean);
}

function parseJudges(raw) {
    const items = splitListLike(raw);
    return items.map(s => {
    // "Jan Kowalski /przewodniczący sprawozdawca/"
        const m = s.match(/^(.*?)(?:\s*\/\s*([^/]+)\s*\/\s*)?$/u);
        const name = (m?.[1] || s).trim().replace(/\s{2,}/g, ' ');
        const role = (m?.[2] || '').trim();
        return { name, role: role || null };
    });
}

function parseSymbols(raw) {
    const items = splitListLike(raw);
    return items.map(s => {
        const m = s.match(/^\s*(\d{3,4})\s*(.*)$/);
        return m ? { code: m[1], opis: m[2].trim() || null } : { code: null, opis: s || null };
    });
}

function extractSygnatura($) {
    // Przykład: "V SA/Wa 3345/24 - Wyrok WSA w Warszawie..."
    const head = $('#warunek .war_header').first().text().trim() || $('title').first().text().trim();
    if (!head) return null;
    const beforeDash = head.split(/\s+-\s+/)[0].trim();
    return beforeDash || null;
}

function extractInfoList($) {
    const out = {};

    // przejdź po wierszach właściwej tabeli z danymi
    $('#res-div table.info-list tr').each((_, tr) => {
        const $tr = $(tr);

        // label zawsze jest w .lista-label (wewnętrzna tabelka w lewej kolumnie)
        const label = $tr.find('.lista-label').first().text().trim();
        const key = LABEL_MAP[label];
        if (!key) return;

        // standardowa prawa kolumna
        const $valCell = $tr.find('.info-list-value').first();

        // Uzasadnienie/Sentencja mają inny układ – łapiemy niżej w extractSections
        if (!$valCell.length) {
            return;
        }

        // W "Data orzeczenia" wartość siedzi w 1. <td>, a w 2. bywa "orzeczenie nieprawomocne"
        let raw = '';
        const firstTd = $valCell.find('td').first();
        if (firstTd.length) {
            raw = firstTd.text().trim();
        } else {
            raw = textWithBrToLines($, $valCell);
        }

        if (!raw) return;

        if (out[key]) out[key] += `\n${raw}`;
        else out[key] = raw;

        // podgląd prawomocności jeśli akurat jesteśmy na wierszu z datą orzeczenia
        if (key === 'data_orzeczenia') {
            const side = $valCell.find('td').eq(1).text().toLowerCase();
            if (side.includes('nieprawomocne')) out.__prawomocne_guess = 0;
            else if (side.includes('prawomocne')) out.__prawomocne_guess = 1;
        }
    });

    return out;
}

function extractSections($) {
    // Sentencja bywa w wierszu z .info-list-label-uzasadnienie
    let sentencja = '';
    const sentCell = $('.info-list-label-uzasadnienie .lista-label')
        .filter((_, el) => $(el).text().trim().toLowerCase() === 'sentencja')
        .closest('td')
        .siblings('td')
        .find('.info-list-value-uzasadnienie');

    if (sentCell.length) {
        sentencja = textWithBrToLines($, sentCell);
    } else {
    // fallback – heurystyka po nagłówkach w tekście strony
        const bodyText = $('body').text().replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
        const sentIdx = bodyText.search(/\bSENTENCJA\b|\bSentencja\b/u);
        if (sentIdx !== -1) {
            // do końca lub do UZASADNIENIE
            const uzasIdx = bodyText.search(/\bUZASADNIENIE\b|\bUzasadnienie\b/u);
            sentencja = bodyText.slice(sentIdx, uzasIdx !== -1 ? uzasIdx : undefined).trim();
        }
    }

    // Uzasadnienie
    let uzasadnienie = '';
    const uzCell = $('.info-list-label-uzasadnienie .lista-label')
        .filter((_, el) => $(el).text().trim().toLowerCase() === 'uzasadnienie')
        .closest('td')
        .siblings('td')
        .find('.info-list-value-uzasadnienie');

    if (uzCell.length) {
        uzasadnienie = textWithBrToLines($, uzCell);
    } else {
        const bodyText = $('body').text().replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
        const uzasIdx = bodyText.search(/\bUZASADNIENIE\b|\bUzasadnienie\b/u);
        if (uzasIdx !== -1) {
            uzasadnienie = bodyText.slice(uzasIdx).trim();
        }
    }

    return { sentencja, uzasadnienie };
}

function normalizeJoined(list) {
    if (!list || !list.length) return null;
    return list.join(' | ');
}

function cap(str, len) {
    if (str == null) return null;
    const s = String(str);
    return s.length > len ? s.slice(0, len) : s;
}

async function saveDataToDatabase(database, parsed, logger) {
    const conn = await database.pool.getConnection();
    await conn.beginTransaction();
    try {
    // upsert do parsed_data po UNIQUE(link)
        const sql = `
      INSERT INTO parsed_data (
        id,                -- trzymamy to samo id co w scraped_data
        sygnatura,
        data_orzeczenia,
        data_wplywu,
        sad,
        hasla_tematyczne,
        oskarzony_organ,
        tresc_wyniku,
        powolane_przepisy,
        sentencja,
        uzasadnienie,
        prawomocne,
        uzasadnienie_flag,
        link,
        tytul
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        sygnatura = VALUES(sygnatura),
        data_orzeczenia = VALUES(data_orzeczenia),
        data_wplywu = VALUES(data_wplywu),
        sad = VALUES(sad),
        hasla_tematyczne = VALUES(hasla_tematyczne),
        oskarzony_organ = VALUES(oskarzony_organ),
        tresc_wyniku = VALUES(tresc_wyniku),
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
            parsed.data_wplywu || null,
            parsed.sad || null,
            parsed.hasla_tematyczne || null,
            parsed.oskarzony_organ || null,
            parsed.tresc_wyniku || null,
            parsed.powolane_przepisy || null,
            parsed.sentencja || null,
            parsed.uzasadnienie || null,
            parsed.prawomocne ?? null,
            parsed.uzasadnienie_flag ?? null,
            parsed.link || null,
            parsed.tytul || null,
        ]);

        // === tabele zależne ===
        const parsedId = parsed.id;

        // sedziowie
        await conn.query('DELETE FROM sedziowie WHERE parsed_data_id = ?', [parsedId]);
        if (parsed.sedziowie_arr?.length) {
            const values = parsed.sedziowie_arr
                .map(j => [parsedId, cap(j?.name, 255) || null, cap(j?.role, 255) || null])
                .filter(v => v[1]); // musi być nazwisko
            if (values.length) {
                await conn.query('INSERT INTO sedziowie (parsed_data_id, sedzia, rola) VALUES ?', [values]);
            }
        }

        // symbol_z_opisem
        await conn.query('DELETE FROM symbol_z_opisem WHERE parsed_data_id = ?', [parsedId]);
        if (parsed.symbole_arr?.length) {
            const values = parsed.symbole_arr.map(s => {
                const full = (s?.code ? `${s.code} ${s.opis || ''}` : (s?.opis || '')).trim();
                return [parsedId, cap(s?.code, 32) || null, cap(s?.opis, 512) || null, cap(full, 1024) || null];
            });
            if (values.length) {
                await conn.query(
                    'INSERT INTO symbol_z_opisem (parsed_data_id, symbol, opis, pelna_wartosc) VALUES ?',
                    [values],
                );
            }
        }

        await conn.commit();
        logger.info(`NSA: zapisano parsed_data id=${parsedId}`);
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

            // 1) odczyt prostych pól
            const info = extractInfoList($);

            // 2) sędziowie
            const sedziowieRaw = info.sedziowie_raw || '';
            const sedziowieArr = parseJudges(textWithBrToLines($, $('<div>').html(sedziowieRaw)));
            const sedziowieJoined = normalizeJoined(
                sedziowieArr.map(x => x.name + (x.role ? ` (${x.role})` : '')),
            );

            // 3) symbole
            const symboleArr = parseSymbols(info.symbol_z_opisem || '');
            const symboleJoined = normalizeJoined(
                symboleArr.map(s => (s.code ? `${s.code}${s.opis ? ' ' + s.opis : ''}` : (s.opis || ''))),
            );

            // 4) sekcje
            const { sentencja, uzasadnienie } = extractSections($);

            // 5) sygnatura (z nagłówka/tytułu – bo zwykle nie ma w info-list)
            const sygnatura =
        info.sygnatura /* jeśli wyjątkowo jest w tabeli */ ||
        extractSygnatura($) ||
        null;

            // 6) title strony
            const tytul = ($('title').text() || row.title || '').trim() || null;

            // 7) prawomocność / uzasadnienie z scraped_data (preferujmy dane z bazy, jeśli są)
            const prawomocne =
        row.prawomocne ?? (typeof info.__prawomocne_guess !== 'undefined' ? info.__prawomocne_guess : null);
            const uzasadnienie_flag = row.uzasadnienie ?? null;

            const parsed = {
                id: row.id, // utrzymujemy spójność klucza z scraped_data
                sygnatura,
                data_orzeczenia: info.data_orzeczenia || null,
                data_wplywu: info.data_wplywu || null,
                sad: info.sad || null,
                hasla_tematyczne: info.hasla_tematyczne || null,
                oskarzony_organ: info.oskarzony_organ || null,
                tresc_wyniku: info.tresc_wyniku || null,
                powolane_przepisy: info.powolane_przepisy || null,

                sentencja: sentencja || null,
                uzasadnienie: uzasadnienie || null,

                prawomocne,
                uzasadnienie_flag,

                link: row.link || null,
                tytul,

                // do tabel zależnych
                sedziowie_arr: sedziowieArr,
                symbole_arr: symboleArr,

                // (opcjonalnie – jeśli chcesz też trzymać w parsed_data, dodaj kolumny i zapisz)
                sedziowie_joined: sedziowieJoined,
                symbole_joined: symboleJoined,
            };

            // sanity: nie łataj placeholderami – jeśli czegoś nie znaleziono, zostaje null
            ['data_orzeczenia', 'data_wplywu'].forEach(k => {
                if (parsed[k] && /[A-Za-zążźćśńółęĄŻŹĆŚŃÓŁĘ]/.test(parsed[k])) parsed[k] = null; // odrzuć ew. "Data orzeczenia"
            });

            await saveDataToDatabase(database, parsed, logger);
        }

        logger.info('NSA parser: zakończono.');
    } catch (error) {
        logger.error('nsaParser error:', error);
    }
};

module.exports = { nsaParser };
