import 'dotenv/config';

export const cfg = {
  mysql: {
    host: process.env.MYSQL_HOST,
    port: +process.env.MYSQL_PORT || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DB,
    table: process.env.MYSQL_TABLE
  },
  mongo: {
    uri: process.env.MONGO_URI,
    db: process.env.MONGO_DB || 'legal',
    coll: process.env.MONGO_COLL || 'legal_chunks',
    indexName: process.env.MONGO_INDEX_NAME || 'legal_chunks_vec'
  },
  openai: {
    key: process.env.OPENAI_API_KEY,
    embedModel: process.env.EMBED_MODEL || 'text-embedding-3-small',
    chatModel: process.env.CHAT_MODEL || 'gpt-4o-mini'
  },
  chunk: {
    size: +process.env.CHUNK_CHARS || 8000,
    overlap: +process.env.CHUNK_OVERLAP || 1000
  },
  ingest: {
    batchRows: +process.env.BATCH_ROWS || 2000,
    embedBatch: +process.env.EMBED_BATCH || 128,
    maxRows: +process.env.MAX_ROWS || -1
  },
  api: {
    port: +process.env.PORT || 8000,
    topK: +process.env.TOP_K || 6,
    numCandidates: +process.env.NUM_CANDIDATES || 200
  }
};
