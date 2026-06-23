const express = require('express');
const { Pool } = require('pg');

const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('PG pool error:', err.message);
});

async function q(text, params = []) {
  const { rows } = await pool.query(text, params);
  return rows;
}

function wrap(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  };
}

// GET /api/stats/daily?date=YYYY-MM-DD
router.get('/daily', wrap(async (req, res) => {
  const { date } = req.query;
  const rows = date
    ? await q(`SELECT * FROM amo_call_daily_stats WHERE stat_date = $1 ORDER BY manager_name`, [date])
    : await q(`SELECT * FROM amo_call_daily_stats WHERE stat_date = (SELECT MAX(stat_date) FROM amo_call_daily_stats) ORDER BY manager_name`);
  res.json({ success: true, data: rows });
}));

// GET /api/stats/daily/dates
router.get('/daily/dates', wrap(async (_req, res) => {
  const rows = await q(`SELECT DISTINCT stat_date FROM amo_call_daily_stats ORDER BY stat_date DESC`);
  res.json({ success: true, data: rows.map((r) => r.stat_date) });
}));

// GET /api/stats/weekly?week=YYYY-MM-DD  (Monday date of the week)
router.get('/weekly', wrap(async (req, res) => {
  const { week } = req.query;
  const rows = week
    ? await q(`SELECT * FROM amo_call_weekly_stats WHERE stat_week = $1 ORDER BY manager_name`, [week])
    : await q(`SELECT * FROM amo_call_weekly_stats WHERE stat_week = (SELECT MAX(stat_week) FROM amo_call_weekly_stats) ORDER BY manager_name`);
  res.json({ success: true, data: rows });
}));

// GET /api/stats/weekly/weeks
router.get('/weekly/weeks', wrap(async (_req, res) => {
  const rows = await q(`
    SELECT DISTINCT stat_week, period_start, period_end
    FROM amo_call_weekly_stats
    ORDER BY stat_week DESC
  `);
  res.json({ success: true, data: rows });
}));

// GET /api/stats/monthly?month=YYYY-MM-DD  (first day of month)
router.get('/monthly', wrap(async (req, res) => {
  const { month } = req.query;
  const rows = month
    ? await q(`SELECT * FROM amo_call_monthly_stats WHERE stat_month = $1 ORDER BY manager_name`, [month])
    : await q(`SELECT * FROM amo_call_monthly_stats WHERE stat_month = (SELECT MAX(stat_month) FROM amo_call_monthly_stats) ORDER BY manager_name`);
  res.json({ success: true, data: rows });
}));

// GET /api/stats/monthly/months
router.get('/monthly/months', wrap(async (_req, res) => {
  const rows = await q(`
    SELECT DISTINCT stat_month, period_start, period_end
    FROM amo_call_monthly_stats
    ORDER BY stat_month DESC
  `);
  res.json({ success: true, data: rows });
}));

// GET /api/stats/managers
router.get('/managers', wrap(async (_req, res) => {
  const rows = await q(`SELECT DISTINCT manager_name FROM amo_call_daily_stats ORDER BY manager_name`);
  res.json({ success: true, data: rows.map((r) => r.manager_name) });
}));

module.exports = router;
