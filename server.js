'use strict';
require('dotenv').config();

const express = require('express');
const { Pool }  = require('pg');
const path      = require('path');
const https     = require('https');
const { randomUUID } = require('crypto');

const app  = express();
const PORT = parseInt(process.env.PORT || '5002', 10);

const AMO_DOMAIN       = process.env.AMOCRM_DOMAIN  || 'numbersarkon.amocrm.ru';
const AMO_TOKEN        = process.env.AMOCRM_TOKEN   || '';
const TARGET_MANAGERS  = (process.env.TARGET_MANAGERS || 'Asadbek').split(',').map(s => s.trim()).filter(Boolean);
const SYNC_SECRET      = process.env.SYNC_SECRET    || '';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// ─── DB init (creates tables if missing) ─────────────────────────────────────
async function initDb() {
  const cols = `
    total_calls INT DEFAULT 0, incoming_answered INT DEFAULT 0,
    outgoing_answered INT DEFAULT 0, out_recall_clients INT DEFAULT 0,
    missed_clients INT DEFAULT 0,
    recalled_clients INT DEFAULT 0, not_recalled_clients INT DEFAULT 0,
    answer_rate FLOAT DEFAULT 0, recall_rate FLOAT DEFAULT 0,
    no_recall_pct FLOAT DEFAULT 0, avg_recall_minutes FLOAT DEFAULT 0,
    h_09_11 INT DEFAULT 0, h_11_13 INT DEFAULT 0, h_13_15 INT DEFAULT 0,
    h_15_17 INT DEFAULT 0, h_17_19 INT DEFAULT 0, h_19_21 INT DEFAULT 0,
    h_21_23 INT DEFAULT 0
  `;
  const tables = [
    [`CREATE TABLE IF NOT EXISTS amo_call_daily_stats (
      stat_date DATE NOT NULL, manager_name TEXT NOT NULL,
      ${cols}, PRIMARY KEY (stat_date, manager_name)
    )`, 'amo_call_daily_stats'],
    [`CREATE TABLE IF NOT EXISTS amo_call_weekly_stats (
      stat_week DATE NOT NULL, manager_name TEXT NOT NULL,
      period_start DATE, period_end DATE,
      ${cols}, PRIMARY KEY (stat_week, manager_name)
    )`, 'amo_call_weekly_stats'],
    [`CREATE TABLE IF NOT EXISTS amo_call_monthly_stats (
      stat_month DATE NOT NULL, manager_name TEXT NOT NULL,
      period_start DATE, period_end DATE,
      ${cols}, PRIMARY KEY (stat_month, manager_name)
    )`, 'amo_call_monthly_stats'],
    [`CREATE TABLE IF NOT EXISTS amo_sync_logs (
      id BIGSERIAL PRIMARY KEY,
      synced_at TIMESTAMPTZ DEFAULT NOW(), status TEXT NOT NULL,
      manager TEXT, events_count INT, duration_ms INT, error_msg TEXT
    )`, 'amo_sync_logs'],
    [`CREATE TABLE IF NOT EXISTS amo_debts (
      id BIGSERIAL PRIMARY KEY,
      mijoz_nomi TEXT NOT NULL,
      mahsulot TEXT NOT NULL,
      qarzdorlik_summasi NUMERIC NOT NULL,
      kelishilgan_sana DATE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`, 'amo_debts'],
  ];
  for (const [sql, name] of tables) {
    try { await pool.query(sql); console.log(`Table OK: ${name}`); }
    catch (e) { console.error(`Table FAIL: ${name}:`, e.message); }
  }
  // Migrate: add out_recall_clients column if missing
  for (const t of ['amo_call_daily_stats','amo_call_weekly_stats','amo_call_monthly_stats']) {
    try {
      await pool.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS out_recall_clients INT DEFAULT 0`);
    } catch (e) { console.error(`Migrate ${t}:`, e.message); }
  }
}

// ─── Express ──────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/version', (_req, res) => res.json({ v: '2.1', started: new Date().toISOString() }));

app.get('/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok' }); }
  catch (e) { res.status(500).json({ status: 'error', error: e.message }); }
});

app.get('/api/stats', async (req, res) => {
  const { period = 'daily', manager } = req.query;
  let table, dateField, selectExpr;
  if      (period === 'weekly')  { table = 'amo_call_weekly_stats';  dateField = 'stat_week';  selectExpr = '*, stat_week AS week_start'; }
  else if (period === 'monthly') { table = 'amo_call_monthly_stats'; dateField = 'stat_month'; selectExpr = '*, stat_month AS month_start'; }
  else                           { table = 'amo_call_daily_stats';   dateField = 'stat_date';  selectExpr = '*'; }
  try {
    const where = manager ? 'WHERE manager_name = $1' : '';
    const { rows } = await pool.query(
      `SELECT ${selectExpr} FROM ${table} ${where} ORDER BY ${dateField} DESC LIMIT 1`,
      manager ? [manager] : []
    );
    res.json(rows[0] || null);
  } catch (e) {
    console.error(`/api/stats ${period} error code=${e.code}:`, e.message);
    if (e.code && e.code.startsWith('42')) return res.json(null); // schema error → show "no data"
    res.status(500).json({ error: e.message || String(e) });
  }
});

app.get('/api/debug/schema', async (_req, res) => {
  const results = {};
  for (const t of ['amo_call_daily_stats','amo_call_weekly_stats','amo_call_monthly_stats','amo_sync_logs']) {
    try {
      const result = await pool.query(`SELECT * FROM ${t} LIMIT 0`);
      results[t] = { ok: true, fields: result.fields.map(f => f.name) };
    } catch (e) {
      results[t] = { ok: false, code: e.code, error: e.message };
    }
  }
  res.json(results); // always 200 so body is readable
});

app.get('/api/sync/status', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM amo_sync_logs ORDER BY synced_at DESC LIMIT 1'
    );
    res.json(rows[0] || null);
  } catch (e) { res.status(500).json({ error: e.message || String(e) }); }
});

// ─── AmoCRM helpers ───────────────────────────────────────────────────────────
function httpGet(urlPath, params) {
  const qs = params && Object.keys(params).length
    ? '?' + new URLSearchParams(
        Object.entries(params).map(([k, v]) => [k, String(v)])
      ).toString()
    : '';

  return new Promise((resolve, reject) => {
    const options = {
      hostname: AMO_DOMAIN,
      path: `/api/v4/${urlPath}${qs}`,
      headers: { Authorization: `Bearer ${AMO_TOKEN}` },
      timeout: 60000,
    };
    const req = https.get(options, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try   { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: {} }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('AMO timeout')));
  });
}

async function amoGet(urlPath, params) {
  for (let i = 0; i < 3; i++) {
    try { return await httpGet(urlPath, params); }
    catch (e) { if (i === 2) throw e; await new Promise(r => setTimeout(r, 5000 * (i + 1))); }
  }
}

async function getTargetUserIds() {
  const r = await amoGet('users');
  if (r.status === 401) throw new Error('AmoCRM 401: token invalid');
  const result = {};
  for (const u of r.body._embedded?.users || []) {
    for (const name of TARGET_MANAGERS) {
      if ((u.name || '').toLowerCase().includes(name.toLowerCase()))
        result[u.id] = u.name;
    }
  }
  return result;
}

async function fetchCallEvents(userIds, fromTs, toTs) {
  const all = [];
  for (const etype of ['incoming_call', 'outgoing_call']) {
    let page = 1;
    while (true) {
      const r = await amoGet('events', {
        'filter[created_at][from]': fromTs, 'filter[created_at][to]': toTs,
        'filter[type]': etype, limit: 100, page,
      });
      if (r.status === 204 || r.status === 404) break;
      const items = r.body._embedded?.events || [];
      if (!items.length) break;
      all.push(...items.filter(e => userIds.includes(e.created_by)));
      if (!r.body._links?.next) break;
      page++;
    }
  }
  return all;
}

async function fetchNotes(noteIds) {
  const notes = {};
  const unique = [...new Set(noteIds)];
  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50);
    const params = { limit: 50 };
    batch.forEach((id, j) => { params[`filter[id][${j}]`] = id; });
    for (const entity of ['contacts', 'leads']) {
      const r = await amoGet(`${entity}/notes`, params);
      if (r.status === 200) {
        let found = false;
        for (const n of r.body._embedded?.notes || []) {
          if (batch.includes(n.id)) { notes[n.id] = n.params || {}; found = true; }
        }
        if (found) break;
      }
    }
  }
  return notes;
}

// ─── Call stats ───────────────────────────────────────────────────────────────
const TZ = 5;
const SLOTS = [
  ['09:00-11:00', 9, 11], ['11:00-13:00', 11, 13], ['13:00-15:00', 13, 15],
  ['15:00-17:00', 15, 17], ['17:00-19:00', 17, 19], ['19:00-21:00', 19, 21],
  ['21:00-23:00', 21, 23],
];

function slotFor(ts) {
  const h = (Math.floor((ts % 86400) / 3600) + TZ) % 24;
  const s = SLOTS.find(([, sh, eh]) => h >= sh && h < eh);
  return s ? s[0] : null;
}

function buildRecords(events, notes) {
  return events
    .sort((a, b) => (a.created_at || 0) - (b.created_at || 0))
    .flatMap(e => {
      if (!e.entity_id) return [];
      const noteId = e.value_after?.find(va => va.note?.id)?.note?.id;
      const p = noteId ? (notes[noteId] || {}) : {};
      return [{ dir: p.direction || (e.type === 'incoming_call' ? 'inbound' : 'outbound'),
                dur: p.duration ?? -1, cid: e.entity_id, ts: e.created_at || 0 }];
    });
}

function calcStats(records, fromTs, toTs) {
  const filtered = records.filter(r => r.ts >= fromTs && r.ts <= toTs)
                          .sort((a, b) => a.ts - b.ts);
  const hours = Object.fromEntries(SLOTS.map(([l]) => [l, 0]));
  const missedAt = {}, missed = new Set(), recalled = new Set(), gaps = [];
  let inA = 0, outA = 0, outR = 0;

  for (const { cid, dir, dur, ts } of filtered) {
    const slot = slotFor(ts);
    if (dir === 'inbound') {
      if (dur <= 0) {
        missed.add(cid); recalled.delete(cid);
        if (!(cid in missedAt)) missedAt[cid] = ts;
        if (slot) hours[slot]++;
      } else {
        missed.delete(cid); delete missedAt[cid];
        inA++; if (slot) hours[slot]++;
      }
    } else if (dir === 'outbound' && dur > 0) {
      if (slot) hours[slot]++;
      if (missed.has(cid)) {
        outR++;
        recalled.add(cid); missed.delete(cid);
        if (cid in missedAt) { const g = (ts - missedAt[cid]) / 60; if (g > 0 && g <= 600) gaps.push(g); delete missedAt[cid]; }
      } else {
        outA++;
      }
    }
  }

  const m = missed.size + recalled.size, rc = recalled.size, nrc = missed.size;
  const total = inA + outA + outR + m;
  return {
    total, incoming: inA, outgoing: outA, out_recall: outR,
    missed: m, recalled: rc, not_recalled: nrc,
    answer_rate:        total ? Math.round((inA + outA + outR) / total * 100) : 0,
    recall_rate:        m ? Math.round(rc / m * 100) : 0,
    no_recall_pct:      m ? Math.round(nrc / m * 100) : 0,
    avg_recall_minutes: gaps.length
      ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length * 10) / 10 : 0,
    hours,
  };
}

async function upsert(table, uniqueCol, uniqueVal, managerName, st, extra = {}) {
  const h = st.hours;
  const extraKeys = Object.keys(extra);
  const extraColsSql   = extraKeys.length ? ', ' + extraKeys.join(', ') : '';
  const extraParamsSql = extraKeys.map((_, i) => `$${21 + i}`).join(', ');
  const extraPrefixSql = extraKeys.length ? ', ' + extraParamsSql : '';

  await pool.query(`
    INSERT INTO ${table}
      (${uniqueCol}, manager_name,
       total_calls, incoming_answered, outgoing_answered, out_recall_clients,
       missed_clients, recalled_clients, not_recalled_clients,
       answer_rate, recall_rate, no_recall_pct, avg_recall_minutes,
       h_09_11, h_11_13, h_13_15, h_15_17, h_17_19, h_19_21, h_21_23${extraColsSql})
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
            $14,$15,$16,$17,$18,$19,$20${extraPrefixSql})
    ON CONFLICT (${uniqueCol}, manager_name) DO UPDATE SET
      total_calls=$3, incoming_answered=$4, outgoing_answered=$5, out_recall_clients=$6,
      missed_clients=$7, recalled_clients=$8, not_recalled_clients=$9,
      answer_rate=$10, recall_rate=$11, no_recall_pct=$12, avg_recall_minutes=$13,
      h_09_11=$14, h_11_13=$15, h_13_15=$16,
      h_15_17=$17, h_17_19=$18, h_19_21=$19, h_21_23=$20
  `, [
    uniqueVal, managerName,
    st.total, st.incoming, st.outgoing, st.out_recall,
    st.missed, st.recalled, st.not_recalled,
    st.answer_rate, st.recall_rate, st.no_recall_pct, st.avg_recall_minutes,
    h['09:00-11:00']||0, h['11:00-13:00']||0, h['13:00-15:00']||0,
    h['15:00-17:00']||0, h['17:00-19:00']||0, h['19:00-21:00']||0, h['21:00-23:00']||0,
    ...Object.values(extra),
  ]);
}

async function runSync() {
  const t0 = Date.now();
  const targetIds = await getTargetUserIds();
  if (!Object.keys(targetIds).length)
    throw new Error('No managers found: ' + TARGET_MANAGERS.join(', '));

  const now = new Date();
  let yest = new Date(now);
  yest.setUTCDate(yest.getUTCDate() - 1);
  if (yest.getUTCDay() === 0) yest.setUTCDate(yest.getUTCDate() - 1); // skip Sunday

  // All boundaries in Tashkent time (UTC+5). yest.getUTCDate/Month/FullYear() == Tashkent calendar date.
  const TZ_OFF_MS = TZ * 3600 * 1000; // TZ=5 defined globally
  const Y = yest.getUTCFullYear(), Mo = yest.getUTCMonth(), D = yest.getUTCDate();
  const dayStart   = new Date(Date.UTC(Y, Mo, D,     -TZ, 0, 0, 0));   // TZ midnight
  const dayEnd     = new Date(Date.UTC(Y, Mo, D + 1, -TZ, 0, 0, -1)); // TZ end of day
  const wd         = yest.getUTCDay();
  const daysToMon  = wd === 0 ? 6 : wd - 1;
  const weekStart  = new Date(dayStart.getTime() - daysToMon * 86400000);
  const monthStart = new Date(Date.UTC(Y, Mo, 1, -TZ, 0, 0, 0));
  // fmtKey: add TZ offset back so the ISO string shows the correct Tashkent calendar date
  const fmtKey   = dt => new Date(dt.getTime() + TZ_OFF_MS).toISOString().slice(0, 10);
  const weekEnd  = new Date(dayEnd.getTime()  + (6 - daysToMon) * 86400000);
  const monthEnd = new Date(Date.UTC(Y, Mo + 1, 1, -TZ, 0, 0, -1));

  const fromTs = Math.floor(Math.min(weekStart.getTime(), monthStart.getTime()) / 1000);
  const toTs   = Math.floor(dayEnd.getTime() / 1000);

  const events  = await fetchCallEvents(Object.keys(targetIds).map(Number), fromTs, toTs);
  const noteIds = events.flatMap(e =>
    (e.value_after || []).filter(va => va.note?.id).map(va => va.note.id)
  );
  const notes = await fetchNotes(noteIds);

  for (const [uid, managerName] of Object.entries(targetIds)) {
    const mEvts = events.filter(e => e.created_by === parseInt(uid, 10));
    const recs  = buildRecords(mEvts, notes);
    const ts    = d => Math.floor(d.getTime() / 1000);

    const dSt = calcStats(recs, ts(dayStart),  ts(dayEnd));
    const wSt = calcStats(recs, ts(weekStart), ts(dayEnd));
    const mSt = calcStats(recs, ts(monthStart),ts(dayEnd));

    await upsert('amo_call_daily_stats',   'stat_date',  fmtKey(dayStart),   managerName, dSt);
    await upsert('amo_call_weekly_stats',  'stat_week',  fmtKey(weekStart),  managerName, wSt,
                 { period_start: fmtKey(weekStart),  period_end: fmtKey(weekEnd) });
    await upsert('amo_call_monthly_stats', 'stat_month', fmtKey(monthStart), managerName, mSt,
                 { period_start: fmtKey(monthStart), period_end: fmtKey(monthEnd) });
  }

  const dur = Date.now() - t0;
  await pool.query(
    `INSERT INTO amo_sync_logs (id,synced_at,status,manager,events_count,duration_ms)
     VALUES ($4,NOW(),'success',$1,$2,$3)`,
    [Object.values(targetIds)[0], events.length, dur, randomUUID()]
  );
  return { eventsCount: events.length, managers: Object.values(targetIds), durationMs: dur };
}

app.post('/api/sync', async (req, res) => {
  const isUi = req.headers['x-sync-source'] === 'ui';
  if (SYNC_SECRET && !isUi && req.headers.authorization !== `Bearer ${SYNC_SECRET}`)
    return res.status(401).json({ error: 'Unauthorized' });
  try {
    res.json({ status: 'ok', ...(await runSync()) });
  } catch (e) {
    const msg = e.message || String(e);
    pool.query(
      `INSERT INTO amo_sync_logs (id,synced_at,status,error_msg,duration_ms)
       VALUES ($3,NOW(),'error',$1,$2)`,
      [msg, 0, randomUUID()]
    ).catch(() => {});
    res.status(500).json({ error: msg });
  }
});

// ─── Debt endpoints ───────────────────────────────────────────────────────────
app.get('/api/debts', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM amo_debts ORDER BY kelishilgan_sana ASC');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/debts', async (req, res) => {
  const { mijoz_nomi, mahsulot, qarzdorlik_summasi, kelishilgan_sana } = req.body;
  if (!mijoz_nomi || !mahsulot || !qarzdorlik_summasi || !kelishilgan_sana)
    return res.status(400).json({ error: 'All fields required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO amo_debts (mijoz_nomi, mahsulot, qarzdorlik_summasi, kelishilgan_sana)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [mijoz_nomi, mahsulot, qarzdorlik_summasi, kelishilgan_sana]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/debts/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM amo_debts WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ─── Auto-sync ───────────────────────────────────────────────────────────────
function autoSyncOnce(label) {
  console.log(`Auto-sync: ${label}`);
  runSync()
    .then(r => console.log(`Auto-sync ${label} done:`, r.eventsCount, 'events'))
    .catch(e => {
      console.error(`Auto-sync ${label} error:`, e.message);
      pool.query(
        `INSERT INTO amo_sync_logs (id,synced_at,status,error_msg,duration_ms)
         VALUES ($2,NOW(),'error',$1,0)`,
        [e.message, randomUUID()]
      ).catch(err => console.error('sync_logs write failed:', err.message));
    });
}

function scheduleAutoSync() {
  // Run 90s after startup
  setTimeout(() => autoSyncOnce('startup'), 90_000);

  // Run every day at 07:00 Tashkent (UTC+5) = 02:00 UTC
  function scheduleNext() {
    const now  = new Date();
    const next = new Date(now);
    next.setUTCHours(2, 0, 0, 0); // 02:00 UTC = 07:00 Tashkent
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    const delay = next - now;
    console.log(`Next daily sync at 07:00 Tashkent — in ${Math.round(delay / 60000)} min`);
    setTimeout(() => { autoSyncOnce('daily-07:00'); scheduleNext(); }, delay);
  }
  scheduleNext();
}

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Calls dashboard on :${PORT}`);
  initDb().catch(err => console.error('DB init warning:', err.message));
  scheduleAutoSync();
});
