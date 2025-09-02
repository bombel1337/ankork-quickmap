// server/import_unified.js
// Node 16+
// npm i mysql2 dotenv

import 'dotenv/config';
import mysql from 'mysql2/promise';

const {
  MYSQL_HOST = '127.0.0.1',
  MYSQL_PORT = '3306',
  MYSQL_USER = 'root',
  MYSQL_PASSWORD = '',
  UNIFIED_DB = 'ai_unified', // docelowa baza z unified_docs i widokami
} = process.env;

async function main() {
  const conn = await mysql.createConnection({
    host: MYSQL_HOST,
    port: Number(MYSQL_PORT),
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    multipleStatements: true,
  });

  async function exec(sql, label) {
    try {
      await conn.query(sql);
      if (label) console.log('✔', label);
    } catch (e) {
      console.error('✖ Error at', label || 'query', e.sqlMessage || e.message);
      throw e;
    }
  }

  // 0) Baza docelowa
  await exec(
    `CREATE DATABASE IF NOT EXISTS \`${UNIFIED_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
    `DB ${UNIFIED_DB} ready`
  );

  // 1) Tabela unified_docs (bez created_at/updated_at/status_code/content_html)
  await exec(
    `
    CREATE TABLE IF NOT EXISTS \`${UNIFIED_DB}\`.unified_docs (
      unified_id   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      source       ENUM('ms','sn','nsa','uzp') NOT NULL,
      source_pk    VARCHAR(255) NOT NULL,
      UNIQUE KEY uniq_source (source, source_pk),

      title        TEXT NULL,
      date_text    VARCHAR(500) NULL,
      link         VARCHAR(500) NULL,

      content_text LONGTEXT NULL,
      meta         JSON NULL,

      KEY idx_source (source),
      KEY idx_date_text (date_text)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `,
    'Create unified_docs'
  );

  // 1a) Migracje porządkujące (bez błędu jeśli kolumny nie istnieją)
  try {
    await conn.query(
      `ALTER TABLE \`${UNIFIED_DB}\`.unified_docs CHANGE COLUMN \`date\` date_text VARCHAR(500) NULL;`
    );
    console.log('✔ Migrate `date` -> `date_text`');
  } catch {}
  try {
    await conn.query(
      `ALTER TABLE \`${UNIFIED_DB}\`.unified_docs DROP COLUMN IF EXISTS status_code;`
    );
    console.log('✔ Drop `status_code` (if existed)');
  } catch {}
  try {
    await conn.query(
      `ALTER TABLE \`${UNIFIED_DB}\`.unified_docs DROP COLUMN IF EXISTS content_html;`
    );
    console.log('✔ Drop `content_html` (if existed)');
  } catch {}
  try {
    await conn.query(
      `ALTER TABLE \`${UNIFIED_DB}\`.unified_docs DROP COLUMN IF EXISTS created_at;`
    );
    console.log('✔ Drop `created_at` (if existed)');
  } catch {}
  try {
    await conn.query(
      `ALTER TABLE \`${UNIFIED_DB}\`.unified_docs DROP COLUMN IF EXISTS updated_at;`
    );
    console.log('✔ Drop `updated_at` (if existed)');
  } catch {}

  // 2) Widok: MS — source_pk z parsed_data, link z parsed_data, obie daty w meta
  await exec(
    `
    CREATE OR REPLACE VIEW \`${UNIFIED_DB}\`.v_unified_ms
    (source, source_pk, title, date_text, link, content_text, meta)
    AS
    SELECT
      'ms' AS source,
      CAST(p.id AS CHAR) AS source_pk,

      ANY_VALUE(
        COALESCE(
          NULLIF(p.tytul,''),
          NULLIF(a.title,''),
          'MS sprawa'
        )
      ) AS title,

      -- date_text: preferuj data_orzeczenia, potem data_publikacji, na końcu created_at z articles (tylko do wyliczenia)
      ANY_VALUE(
        CASE
          WHEN NULLIF(p.data_orzeczenia,'') IS NOT NULL THEN p.data_orzeczenia
          WHEN NULLIF(p.data_publikacji,'') IS NOT NULL THEN p.data_publikacji
          ELSE DATE_FORMAT(MIN(a.created_at), '%Y-%m-%d %H:%i:%s')
        END
      ) AS date_text,

      ANY_VALUE(p.link) AS link,

      ANY_VALUE(TRIM(CONCAT_WS('\\n\\n',
        CONCAT('Sygnatura: ',       NULLIF(p.sygnatura,'')),
        CONCAT('Sąd: ',             NULLIF(p.sad,'')),
        CONCAT('Wydział: ',         NULLIF(p.wydzial,'')),
        CONCAT('Hasła tematyczne: ',NULLIF(p.hasla_tematyczne,'')),
        CONCAT('Podstawa prawna:\\n',NULLIF(p.podstawa_prawna,'')),
        CONCAT('Wyrok:\\n',         NULLIF(p.wyrok,'')),
        CONCAT('Uzasadnienie:\\n',  NULLIF(p.uzasadnienie,'')),
        CONCAT('Zarządzenie:\\n',   NULLIF(p.zarzadzenie,'')),
        CONCAT('Postanowienie:\\n', NULLIF(p.postanowienie,''))
      ))) AS content_text,

      JSON_OBJECT(
        'sygnatura',         ANY_VALUE(p.sygnatura),
        'sad',               ANY_VALUE(p.sad),
        'wydzial',           ANY_VALUE(p.wydzial),
        'hasla',             ANY_VALUE(p.hasla_tematyczne),
        'link_parsed',       ANY_VALUE(p.link),

        -- obie daty, jeżeli są
        'data_orzeczenia',   ANY_VALUE(NULLIF(p.data_orzeczenia,'')),
        'data_publikacji',   ANY_VALUE(NULLIF(p.data_publikacji,'')),

        -- informacja skąd pochodzi date_text
        'date_text_source',  ANY_VALUE(
                               CASE
                                 WHEN NULLIF(p.data_orzeczenia,'') IS NOT NULL THEN 'data_orzeczenia'
                                 WHEN NULLIF(p.data_publikacji,'') IS NOT NULL THEN 'data_publikacji'
                                 ELSE 'articles.created_at'
                               END
                             ),

        -- powiązane artykuły (id, tytuł, link) z articles <-> parsed_data
        'articles',
          (
            SELECT JSON_ARRAYAGG(
                     JSON_OBJECT(
                       'article_id', x.article_id,
                       'title',      x.title,
                       'link',       x.link
                     )
                   )
            FROM (
              SELECT DISTINCT a2.article_id, a2.title, a2.link
              FROM ms.articles_references ar2
              JOIN ms.articles a2 ON a2.article_id = ar2.article_id
              WHERE ar2.parsed_data_id = p.id
            ) AS x
          )
      ) AS meta

    FROM ms.parsed_data p
    LEFT JOIN ms.articles_references ar ON ar.parsed_data_id = p.id
    LEFT JOIN ms.articles a             ON a.article_id      = ar.article_id
    GROUP BY p.id;
    `,
    'Create view v_unified_ms'
  );

  // 3) Widok: SN (bez created_at/updated_at)
  await exec(
    `
    CREATE OR REPLACE VIEW \`${UNIFIED_DB}\`.v_unified_sn
    (source, source_pk, title, date_text, link, content_text, meta)
    AS
    SELECT
      'sn' AS source,
      p.item_sid AS source_pk,

      ANY_VALUE(COALESCE(NULLIF(p.sygnatura,''), 'Sprawa SN')) AS title,
      ANY_VALUE(NULLIF(p.data_wydania,'')) AS date_text,

      -- LINK: zawsze page_link
      ANY_VALUE(NULLIF(p.page_link,'')) AS link,

      -- CONTENT: metadane + pełne sekcje z nagłówkami
      ANY_VALUE(TRIM(CONCAT_WS('\\n\\n',
        CONCAT('Sygnatura: ',           NULLIF(p.sygnatura,'')),
        CONCAT('Forma orzeczenia: ',    NULLIF(p.forma_orzeczenia,'')),
        CONCAT('Data wydania: ',        NULLIF(p.data_wydania,'')),
        CONCAT('Izba: ',                NULLIF(p.izba,'')),
        CONCAT('Typ składu sędziów: ',  NULLIF(p.typ_skladu_sedziow,'')),
        CONCAT('Przewodniczący składu: ', NULLIF(p.przewodniczacy_skladu,'')),
        CONCAT('Sprawozdawca: ',        NULLIF(p.sprawozdawca,'')),
        CONCAT('Autor uzasadnienia: ',  NULLIF(p.autor_uzasadnienia,'')),
        CONCAT('Jednostka obsługująca: ',NULLIF(p.jednostka_obslugujaca,'')),

        CONCAT('Wyrok:\\n',             NULLIF(p.wyrok,'')),
        CONCAT('Uzasadnienie:\\n',      NULLIF(p.uzasadnienie,'')),
        CONCAT('Postanowienie:\\n',     NULLIF(p.postanowienie,'')),
        CONCAT('Uchwała:\\n',           NULLIF(p.uchwala,'')),
        CONCAT('Zarządzenie:\\n',       NULLIF(p.zarzadzenie,'')),
        CONCAT('Treść orzeczenia:\\n',  NULLIF(p.tresc_orzeczenia,''))
      ))) AS content_text,

      JSON_OBJECT(
        'sygnatura',            ANY_VALUE(p.sygnatura),
        'forma_orzeczenia',     ANY_VALUE(p.forma_orzeczenia),
        'data_wydania',         ANY_VALUE(p.data_wydania),
        'izba',                 ANY_VALUE(p.izba),
        'typ_skladu_sedziow',   ANY_VALUE(p.typ_skladu_sedziow),
        'przewodniczacy_skladu',ANY_VALUE(p.przewodniczacy_skladu),
        'sprawozdawca',         ANY_VALUE(p.sprawozdawca),
        'autor_uzasadnienia',   ANY_VALUE(p.autor_uzasadnienia),
        'jednostka_obslugujaca',ANY_VALUE(p.jednostka_obslugujaca),

        -- wszystkie linki do meta
        'links', JSON_OBJECT(
          'page_link', ANY_VALUE(p.page_link),
          'link_html', ANY_VALUE(p.link_html),
          'link_pdf',  ANY_VALUE(p.link_pdf)
        ),

        -- pełna lista sędziów (id, name)
        'sedziowie',
          (
            SELECT JSON_ARRAYAGG(JSON_OBJECT('id', x.id, 'name', x.name))
            FROM (
              SELECT DISTINCT s.id, s.name
              FROM sn.orzeczenia_sedziowie os
              JOIN sn.sedziowie s ON s.id = os.sedzia_id
              WHERE os.orzeczenie_sid = p.item_sid
              ORDER BY s.name
            ) AS x
          )
      ) AS meta

    FROM sn.parsed_data p
    GROUP BY p.item_sid;
    `,
    'Create view v_unified_sn'
  );

  // 4) Widok: NSA (bez created_at/updated_at)
  await exec(
    `
    CREATE OR REPLACE VIEW \`${UNIFIED_DB}\`.v_unified_nsa
  (source, source_pk, title, date_text, link, content_text, meta)
  AS
  SELECT
    'nsa' AS source,
    CAST(p.id AS CHAR) AS source_pk,

    ANY_VALUE(COALESCE(NULLIF(p.tytul,''), NULLIF(p.sygnatura,''), 'Sprawa NSA')) AS title,

    -- data do unified: data_wplywu
    ANY_VALUE(NULLIF(p.data_wplywu,'')) AS date_text,

    ANY_VALUE(p.link) AS link,

    -- content_text: najpierw skrócone metadane, potem pełna Sentencja i Uzasadnienie
    ANY_VALUE(TRIM(CONCAT_WS('\\n\\n',
      CONCAT('Sygnatura: ',        NULLIF(p.sygnatura,'')),
      CONCAT('Sąd: ',              NULLIF(p.sad,'')),
      CONCAT('Skarżony organ: ',   NULLIF(p.skarzony_organ,'')),
      CONCAT('Treść wyniku: ',     NULLIF(p.tresc_wyniku,'')),

      CONCAT('Sentencja:\\n',      NULLIF(p.sentencja,'')),
      CONCAT('Uzasadnienie:\\n',   NULLIF(p.uzasadnienie,''))
    ))) AS content_text,

    JSON_OBJECT(
      'sygnatura',          ANY_VALUE(p.sygnatura),
      'sad',                ANY_VALUE(p.sad),
      'data_orzeczenia',    ANY_VALUE(p.data_orzeczenia),
      'data_wplywu',        ANY_VALUE(p.data_wplywu),
      'skarzony_organ',     ANY_VALUE(p.skarzony_organ),
      'tresc_wyniku',       ANY_VALUE(p.tresc_wyniku),
      'hasla_tematyczne',   ANY_VALUE(p.hasla_tematyczne),
      'powolane_przepisy',  ANY_VALUE(p.powolane_przepisy),
      'prawomocne',         ANY_VALUE(p.prawomocne),
      'uzasadnienie_flag',  ANY_VALUE(p.uzasadnienie_flag),

      -- sędziowie tej sprawy (nsa.sedziowie)
      'sedziowie',
        (
          SELECT JSON_ARRAYAGG(JSON_OBJECT('name', y.sedzia, 'rola', y.rola))
          FROM (
            SELECT DISTINCT s.sedzia, s.rola
            FROM nsa.sedziowie s
            WHERE s.parsed_data_id = p.id
            ORDER BY s.sedzia
          ) AS y
        ),

      -- symbole z opisem (nsa.symbol_z_opisem)
      'symbole',
        (
          SELECT JSON_ARRAYAGG(JSON_OBJECT('symbol', z.symbol, 'opis', z.opis, 'pelna_wartosc', z.pelna_wartosc))
          FROM (
            SELECT DISTINCT so.symbol, so.opis, so.pelna_wartosc
            FROM nsa.symbol_z_opisem so
            WHERE so.parsed_data_id = p.id
            ORDER BY so.symbol
          ) AS z
        )
    ) AS meta

  FROM nsa.parsed_data p
  GROUP BY p.id;
  `,
  'Create view v_unified_nsa'
  );

  // 5) Widok: UZP (bez created_at/updated_at)
  await exec(
    `
    CREATE OR REPLACE VIEW \`${UNIFIED_DB}\`.v_unified_uzp
    (source, source_pk, title, date_text, link, content_text, meta)
    AS
    SELECT
      'uzp' AS source,
      CAST(p.id AS CHAR) AS source_pk,

      ANY_VALUE(COALESCE(NULLIF(p.rodzaj_dokumentu,''), NULLIF(p.sygnatura,''), 'UZP dokument')) AS title,
      ANY_VALUE(COALESCE(DATE_FORMAT(p.data_wydania_rozstrzygniecia, '%Y-%m-%d'), NULLIF(p.data_wyroku,''))) AS date_text,
      ANY_VALUE(p.page_link) AS link,

      ANY_VALUE(TRIM(CONCAT_WS('\\n\\n',
        CONCAT('Sygnatura: ', NULLIF(p.sygnatura,'')),
        CONCAT('Organ wydający: ', NULLIF(p.organ_wydajacy,'')),
        CONCAT('Rodzaj dokumentu: ', NULLIF(p.rodzaj_dokumentu,'')),
        CONCAT('Zamawiający: ', NULLIF(p.zamawiajacy,'')),
        CONCAT('Miejscowość: ', NULLIF(p.miejscowosc,'')),
        CONCAT('Tryb postępowania: ', NULLIF(p.tryb_postepowania,'')),
        CONCAT('Rodzaj zamówienia: ', NULLIF(p.rodzaj_zamowienia,'')),
        CONCAT('Wyrok:\\n', NULLIF(p.wyrok,'')),
        CONCAT('Uzasadnienie:\\n', NULLIF(p.uzasadnienie,''))
      ))) AS content_text,

      JSON_OBJECT(
        'sygnatura', p.sygnatura,
        'organ_wydajacy', p.organ_wydajacy,
        'rodzaj_dokumentu', p.rodzaj_dokumentu,
        'zamawiajacy', p.zamawiajacy,
        'miejscowosc', p.miejscowosc,
        'tryb_postepowania', p.tryb_postepowania,
        'rodzaj_zamowienia', p.rodzaj_zamowienia,
        'rok_wyroku', p.rok_wyroku,
        'tematy',
        (
          SELECT JSON_ARRAYAGG(JSON_OBJECT('id', x.id, 'name', x.topic_name))
          FROM (
            SELECT DISTINCT t.id, t.topic_name
            FROM uzp.case_topics ct
            JOIN uzp.topics t ON t.id = ct.topic_id
            WHERE ct.parsed_data_id = p.id
          ) AS x
        ),
        'kluczowe_przepisy',
        (
          SELECT JSON_ARRAYAGG(
                  JSON_OBJECT('article_id', y.id,
                              'reference', y.article_reference,
                              'description', y.description)
                )
          FROM (
            SELECT DISTINCT a.id, a.article_reference, a.description
            FROM uzp.key_provisions kp
            JOIN uzp.articles a ON a.id = kp.article_id
            WHERE kp.parsed_data_id = p.id
          ) AS y
        )
      ) AS meta

    FROM uzp.parsed_data p
    GROUP BY p.id;
    `,
    'Create view v_unified_uzp'
  );

  // 6) UPSERT z widoków — bez created_at/updated_at/status_code/content_html
  const upsert = async (viewName) => {
    await exec(
      `
      INSERT INTO \`${UNIFIED_DB}\`.unified_docs
        (source, source_pk, title, date_text, link, content_text, meta)
      SELECT source, source_pk, title, date_text, link, content_text, meta
      FROM \`${UNIFIED_DB}\`.${viewName}
      ON DUPLICATE KEY UPDATE
        title        = VALUES(title),
        date_text    = VALUES(date_text),
        link         = VALUES(link),
        content_text = VALUES(content_text),
        meta         = VALUES(meta);
      `,
      `UPSERT from ${viewName}`
    );
  };

  await upsert('v_unified_ms');
  await upsert('v_unified_sn');
  await upsert('v_unified_nsa');
  await upsert('v_unified_uzp');

  // 7) Statystyki
  const [rows] = await conn.query(
    `SELECT source, COUNT(*) AS cnt FROM \`${UNIFIED_DB}\`.unified_docs GROUP BY source ORDER BY source;`
  );
  console.table(rows);

  await conn.end();
  console.log('Done ✅');
}

main().catch((e) => {
  console.error('Failed ❌', e);
  process.exit(1);
});
