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

  // 1) Tabela unified_docs (data jako STRING)
  await exec(
    `
    CREATE TABLE IF NOT EXISTS \`${UNIFIED_DB}\`.unified_docs (
      unified_id     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      source         ENUM('ms','sn','nsa','uzp') NOT NULL,
      source_pk      VARCHAR(255) NOT NULL,
      UNIQUE KEY uniq_source (source, source_pk),

      title          TEXT NULL,
      date_text      VARCHAR(255) NULL,        -- <-- zamiast DATETIME
      link           VARCHAR(500) NULL,
      status_code    INT NULL,
      created_at     TIMESTAMP NULL,
      updated_at     TIMESTAMP NULL,

      content_html   LONGTEXT NULL,
      content_text   LONGTEXT NULL,

      meta           JSON NULL,

      KEY idx_source (source)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `,
    'Create unified_docs'
  );

  // 1a) Migracja starej kolumny `date` -> `date_text` (jeśli istnieje)
  try {
    await conn.query(
      `ALTER TABLE \`${UNIFIED_DB}\`.unified_docs CHANGE COLUMN \`date\` date_text VARCHAR(255) NULL;`
    );
    console.log('✔ Migrate `date` -> `date_text`');
  } catch {
    // brak starej kolumny — ignorujemy
  }
  // 1b) Index po date_text (opcjonalny)
  try {
    await conn.query(
      `CREATE INDEX idx_date_text ON \`${UNIFIED_DB}\`.unified_docs (date_text);`
    );
    console.log('✔ Create index idx_date_text');
  } catch {
    // istnieje — ignorujemy
  }

  // 2) Widok: MS (daty jako surowy tekst)
  await exec(
    `
    CREATE OR REPLACE VIEW \`${UNIFIED_DB}\`.v_unified_ms AS
    SELECT
      'ms' AS source,
      CAST(a.article_id AS CHAR) AS source_pk,

      ANY_VALUE(COALESCE(NULLIF(p.tytul,''), NULLIF(a.title,''), 'MS sprawa')) AS title,

      ANY_VALUE(
        COALESCE(
          NULLIF(p.data_orzeczenia,''),
          NULLIF(p.data_publikacji,''),
          DATE_FORMAT(a.created_at, '%Y-%m-%d %H:%i:%s')
        )
      ) AS date_text,

      ANY_VALUE(a.link) AS link,
      ANY_VALUE(sd.status_code) AS status_code,
      ANY_VALUE(a.created_at) AS created_at,
      ANY_VALUE(a.created_at) AS updated_at,

      ANY_VALUE(NULL) AS content_html,

      ANY_VALUE(TRIM(CONCAT_WS('\\n\\n',
        CONCAT('Sygnatura: ', NULLIF(p.sygnatura,'')),
        CONCAT('Sąd: ', NULLIF(p.sad,'')),
        CONCAT('Wydział: ', NULLIF(p.wydzial,'')),
        CONCAT('Hasła tematyczne: ', NULLIF(p.hasla_tematyczne,'')),
        CONCAT('Podstawa prawna:\\n', NULLIF(p.podstawa_prawna,'')),
        CONCAT('Wyrok:\\n', NULLIF(p.wyrok,'')),
        CONCAT('Uzasadnienie:\\n', NULLIF(p.uzasadnienie,'')),
        CONCAT('Zarządzenie:\\n', NULLIF(p.zarzadzenie,'')),
        CONCAT('Postanowienie:\\n', NULLIF(p.postanowienie,''))
      ))) AS content_text,

      JSON_OBJECT(
        'sygnatura',        ANY_VALUE(p.sygnatura),
        'sad',              ANY_VALUE(p.sad),
        'wydzial',          ANY_VALUE(p.wydzial),
        'hasla_tematyczne', ANY_VALUE(p.hasla_tematyczne),
        'link_parsed',      ANY_VALUE(p.link)
      ) AS meta

    FROM ms.articles a
    LEFT JOIN ms.articles_references ar ON ar.article_id = a.article_id
    LEFT JOIN ms.parsed_data p ON p.id = ar.parsed_data_id
    LEFT JOIN ms.scraped_data sd ON sd.details_link = a.link
    GROUP BY a.article_id;
    `,
    'Create view v_unified_ms'
  );

  // 3) Widok: SN
  await exec(
    `
    CREATE OR REPLACE VIEW \`${UNIFIED_DB}\`.v_unified_sn AS
    SELECT
      'sn' AS source,
      p.item_sid AS source_pk,

      ANY_VALUE(COALESCE(NULLIF(p.sygnatura,''), 'Sprawa SN')) AS title,
      ANY_VALUE(NULLIF(p.data_wydania,'')) AS date_text,
      ANY_VALUE(COALESCE(NULLIF(p.link_html,''), NULLIF(p.link_pdf,''), NULLIF(p.page_link,''))) AS link,
      ANY_VALUE(NULL) AS status_code,
      ANY_VALUE(p.created_at) AS created_at,
      ANY_VALUE(p.updated_at) AS updated_at,

      ANY_VALUE(NULL) AS content_html,

      ANY_VALUE(TRIM(CONCAT_WS('\\n\\n',
        CONCAT('Sygnatura: ', NULLIF(p.sygnatura,'')),
        CONCAT('Izba: ', NULLIF(p.izba,''), '  Skład: ', NULLIF(p.typ_skladu_sedziow,'')),
        CONCAT('Przewodniczący składu: ', NULLIF(p.przewodniczacy_skladu,'')),
        CONCAT('Sprawozdawca: ', NULLIF(p.sprawozdawca,'')),
        CONCAT('Autor uzasadnienia: ', NULLIF(p.autor_uzasadnienia,'')),
        CONCAT('Forma orzeczenia: ', NULLIF(p.forma_orzeczenia,'')),
        CONCAT('Wyrok:\\n', NULLIF(p.wyrok,'')),
        CONCAT('Uzasadnienie:\\n', NULLIF(p.uzasadnienie,'')),
        CONCAT('Postanowienie:\\n', NULLIF(p.postanowienie,'')),
        CONCAT('Uchwała:\\n', NULLIF(p.uchwala,'')),
        CONCAT('Zarządzenie:\\n', NULLIF(p.zarzadzenie,'')),
        CONCAT('Treść orzeczenia:\\n', NULLIF(p.tresc_orzeczenia,''))
      ))) AS content_text,

      JSON_OBJECT(
        'sygnatura',              ANY_VALUE(p.sygnatura),
        'izba',                   ANY_VALUE(p.izba),
        'typ_skladu',            ANY_VALUE(p.typ_skladu_sedziow),
        'przewodniczacy',        ANY_VALUE(p.przewodniczacy_skladu),
        'sprawozdawca',          ANY_VALUE(p.sprawozdawca),
        'autor_uzasadnienia',    ANY_VALUE(p.autor_uzasadnienia),
        'sedziowie',
          (
            SELECT JSON_ARRAYAGG(JSON_OBJECT('id', x.id, 'name', x.name))
            FROM (
              SELECT DISTINCT s.id, s.name
              FROM sn.orzeczenia_sedziowie os
              JOIN sn.sedziowie s ON s.id = os.sedzia_id
              WHERE os.orzeczenie_sid = p.item_sid
            ) AS x
          )
      ) AS meta

    FROM sn.parsed_data p
    GROUP BY p.item_sid;
    `,
    'Create view v_unified_sn'
  );

  // 4) Widok: NSA
  await exec(
    `
    CREATE OR REPLACE VIEW \`${UNIFIED_DB}\`.v_unified_nsa AS
    SELECT
      'nsa' AS source,
      CAST(p.id AS CHAR) AS source_pk,

      ANY_VALUE(COALESCE(NULLIF(p.tytul,''), NULLIF(p.sygnatura,''))) AS title,
      ANY_VALUE(COALESCE(NULLIF(p.data_orzeczenia,''))) AS date_text,
      ANY_VALUE(p.link) AS link,
      ANY_VALUE(NULL) AS status_code,
      ANY_VALUE(p.created_at) AS created_at,
      ANY_VALUE(p.updated_at) AS updated_at,

      ANY_VALUE(NULL) AS content_html,

      ANY_VALUE(TRIM(CONCAT_WS('\\n\\n',
        CONCAT('Sygnatura: ', NULLIF(p.sygnatura,'')),
        CONCAT('Sąd: ', NULLIF(p.sad,'')),
        CONCAT('Hasła tematyczne:\\n', NULLIF(p.hasla_tematyczne,'')),
        CONCAT('Sentencja:\\n', NULLIF(p.sentencja,'')),
        CONCAT('Uzasadnienie:\\n', NULLIF(p.uzasadnienie,'')),
        CONCAT('Skargony/oskarżony organ: ',
               NULLIF(COALESCE(p.skarzony_organ, p.oskarzony_organ, ''), '')),
        CONCAT('Powołane przepisy:\\n', NULLIF(p.powolane_przepisy,'')),
        CONCAT('Treść wyniku: ', NULLIF(p.tresc_wyniku,'')),
        CONCAT('Prawomocne: ', IFNULL(p.prawomocne, 0))
      ))) AS content_text,

      JSON_OBJECT(
        'sygnatura',        ANY_VALUE(p.sygnatura),
        'sad',              ANY_VALUE(p.sad),
        'hasla_tematyczne', ANY_VALUE(p.hasla_tematyczne),
        'prawomocne',       ANY_VALUE(p.prawomocne),
        'uzasadnienie_flag',ANY_VALUE(p.uzasadnienie_flag),
        'sedziowie',
          (
            SELECT JSON_ARRAYAGG(JSON_OBJECT('name', y.sedzia, 'rola', y.rola))
            FROM (
              SELECT DISTINCT s.sedzia, s.rola
              FROM nsa.sedziowie s
              WHERE s.parsed_data_id = p.id
            ) AS y
          ),
        'symbole',
          (
            SELECT JSON_ARRAYAGG(JSON_OBJECT('symbol', z.symbol, 'opis', z.opis, 'pelna_wartosc', z.pelna_wartosc))
            FROM (
              SELECT DISTINCT so.symbol, so.opis, so.pelna_wartosc
              FROM nsa.symbol_z_opisem so
              WHERE so.parsed_data_id = p.id
            ) AS z
          )
      ) AS meta

    FROM nsa.parsed_data p
    GROUP BY p.id;
    `,
    'Create view v_unified_nsa'
  );

  // 5) Widok: UZP
  await exec(
    `
    CREATE OR REPLACE VIEW \`${UNIFIED_DB}\`.v_unified_uzp AS
    SELECT
      'uzp' AS source,
      CAST(p.id AS CHAR) AS source_pk,

      ANY_VALUE(COALESCE(NULLIF(p.rodzaj_dokumentu,''), NULLIF(p.sygnatura,''), 'UZP dokument')) AS title,
      ANY_VALUE(COALESCE(DATE_FORMAT(p.data_wydania_rozstrzygniecia, '%Y-%m-%d'), NULLIF(p.data_wyroku,''))) AS date_text,
      ANY_VALUE(p.page_link) AS link,
      ANY_VALUE(NULL) AS status_code,
      ANY_VALUE(p.created_at) AS created_at,
      ANY_VALUE(p.updated_at) AS updated_at,

      ANY_VALUE(NULL) AS content_html,

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

  // 6) UPSERT z widoków
  const upsert = async (viewName) => {
    await exec(
      `
      INSERT INTO \`${UNIFIED_DB}\`.unified_docs
        (source, source_pk, title, date_text, link, status_code, created_at, updated_at, content_html, content_text, meta)
      SELECT source, source_pk, title, date_text, link, status_code, created_at, updated_at, content_html, content_text, meta
      FROM \`${UNIFIED_DB}\`.${viewName}
      ON DUPLICATE KEY UPDATE
        title        = VALUES(title),
        date_text    = VALUES(date_text),
        link         = VALUES(link),
        status_code  = VALUES(status_code),
        created_at   = VALUES(created_at),
        updated_at   = VALUES(updated_at),
        content_html = VALUES(content_html),
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
