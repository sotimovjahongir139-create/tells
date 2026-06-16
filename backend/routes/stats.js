const express = require('express');
const sql = require('mssql');

const router = express.Router();

let pool = null;
let poolPromise = null;

function buildConfig() {
  const config = {
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME || 'calldb2',
    port: parseInt(process.env.DB_PORT || '1433', 10),
    options: {
      trustServerCertificate: true,
      encrypt: process.env.DB_ENCRYPT === 'true',
      enableArithAbort: true,
    },
    connectionTimeout: 30000,
    requestTimeout: 30000,
  };

  if (process.env.DB_TRUSTED === 'true') {
    config.options.trustedConnection = true;
  } else {
    config.user = process.env.DB_USER;
    config.password = process.env.DB_PASSWORD;
  }

  return config;
}

async function getPool() {
  if (pool && pool.connected) return pool;
  if (poolPromise) return poolPromise;

  poolPromise = sql.connect(buildConfig())
    .then((p) => {
      pool = p;
      poolPromise = null;
      console.log('DB pool connected');
      return pool;
    })
    .catch((err) => {
      poolPromise = null;
      throw err;
    });

  return poolPromise;
}

function wrap(fn) {
  return async (req, res) => {
    try {
      const db = await getPool();
      await fn(req, res, db);
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  };
}

// GET /api/stats/daily?date=YYYY-MM-DD
router.get('/daily', wrap(async (req, res, db) => {
  const { date } = req.query;
  const request = db.request();
  let query;

  if (date) {
    request.input('date', sql.Date, date);
    query = `
      SELECT * FROM amo_call_daily_stats
      WHERE stat_date = @date
      ORDER BY manager_name
    `;
  } else {
    query = `
      SELECT * FROM amo_call_daily_stats
      WHERE stat_date = (SELECT MAX(stat_date) FROM amo_call_daily_stats)
      ORDER BY manager_name
    `;
  }

  const result = await request.query(query);
  res.json({ success: true, data: result.recordset });
}));

// GET /api/stats/daily/dates  — available dates for dropdown
router.get('/daily/dates', wrap(async (_req, res, db) => {
  const result = await db.request().query(`
    SELECT DISTINCT stat_date
    FROM amo_call_daily_stats
    ORDER BY stat_date DESC
  `);
  res.json({ success: true, data: result.recordset.map((r) => r.stat_date) });
}));

// GET /api/stats/weekly?week=YYYY-WNN
router.get('/weekly', wrap(async (req, res, db) => {
  const { week } = req.query;
  const request = db.request();
  let query;

  if (week) {
    request.input('week', sql.NVarChar(20), week);
    query = `
      SELECT * FROM amo_call_weekly_stats
      WHERE stat_week = @week
      ORDER BY manager_name
    `;
  } else {
    query = `
      SELECT * FROM amo_call_weekly_stats
      WHERE stat_week = (SELECT MAX(stat_week) FROM amo_call_weekly_stats)
      ORDER BY manager_name
    `;
  }

  const result = await request.query(query);
  res.json({ success: true, data: result.recordset });
}));

// GET /api/stats/weekly/weeks  — available weeks for dropdown
router.get('/weekly/weeks', wrap(async (_req, res, db) => {
  const result = await db.request().query(`
    SELECT DISTINCT stat_week, period_start, period_end
    FROM amo_call_weekly_stats
    ORDER BY stat_week DESC
  `);
  res.json({ success: true, data: result.recordset });
}));

// GET /api/stats/monthly?month=YYYY-MM
router.get('/monthly', wrap(async (req, res, db) => {
  const { month } = req.query;
  const request = db.request();
  let query;

  if (month) {
    request.input('month', sql.NVarChar(20), month);
    query = `
      SELECT * FROM amo_call_monthly_stats
      WHERE stat_month = @month
      ORDER BY manager_name
    `;
  } else {
    query = `
      SELECT * FROM amo_call_monthly_stats
      WHERE stat_month = (SELECT MAX(stat_month) FROM amo_call_monthly_stats)
      ORDER BY manager_name
    `;
  }

  const result = await request.query(query);
  res.json({ success: true, data: result.recordset });
}));

// GET /api/stats/monthly/months  — available months for dropdown
router.get('/monthly/months', wrap(async (_req, res, db) => {
  const result = await db.request().query(`
    SELECT DISTINCT stat_month, period_start, period_end
    FROM amo_call_monthly_stats
    ORDER BY stat_month DESC
  `);
  res.json({ success: true, data: result.recordset });
}));

// GET /api/stats/managers
router.get('/managers', wrap(async (_req, res, db) => {
  const result = await db.request().query(`
    SELECT DISTINCT manager_name
    FROM amo_call_daily_stats
    ORDER BY manager_name
  `);
  res.json({ success: true, data: result.recordset.map((r) => r.manager_name) });
}));

module.exports = router;
