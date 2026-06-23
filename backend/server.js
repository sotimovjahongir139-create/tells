require('dotenv').config();
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres.lqdcrnxrqzccismdrwwb:arkon08_trello%23jg%249@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres';
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const statsRouter = require('./routes/stats');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

function resolveConnectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const supabaseUrl = (process.env.SUPABASE_URL || '').replace('https://', '').replace('.supabase.co', '');
  const password    = process.env.SUPABASE_DB_PASSWORD || '';
  if (!supabaseUrl || !password) return null;
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${supabaseUrl}.supabase.co:5432/postgres`;
}

/* health — tests live DB connection */
app.get('/api/health', async (_req, res) => {
  const connStr = resolveConnectionString();
  const envStatus = {
    DATABASE_URL:        !!process.env.DATABASE_URL,
    SUPABASE_URL:        !!process.env.SUPABASE_URL,
    SUPABASE_DB_PASSWORD:!!process.env.SUPABASE_DB_PASSWORD,
  };
  if (!connStr) {
    return res.status(500).json({ status: 'error', db: 'no connection string — set DATABASE_URL or SUPABASE_URL+SUPABASE_DB_PASSWORD', env: envStatus });
  }
  try {
    const pool = new Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 5000 });
    await pool.query('SELECT 1');
    await pool.end();
    res.json({ status: 'ok', db: 'connected', env: envStatus, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: 'error', db: err.message || err.code || String(err), env: envStatus });
  }
});

app.use('/api/stats', statsRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || String(err) });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`DATABASE_URL set: ${!!process.env.DATABASE_URL}`);
});
