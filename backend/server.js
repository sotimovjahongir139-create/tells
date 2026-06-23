require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const statsRouter = require('./routes/stats');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

/* health — tests live DB connection so we can see the real error */
app.get('/api/health', async (_req, res) => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return res.status(500).json({ status: 'error', db: 'DATABASE_URL not set' });
  }
  try {
    const pool = new Pool({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    });
    await pool.query('SELECT 1');
    await pool.end();
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      db: err.message || err.code || String(err),
      code: err.code,
    });
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
