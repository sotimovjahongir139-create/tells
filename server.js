'use strict';
require('dotenv').config();

// Always force the pooler URL — old pm2 env vars must not win
process.env.DATABASE_URL = 'postgresql://postgres.lqdcrnxrqzccismdrwwb:arkon08_trello%23jg%249@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres';

const express = require('express');
const { Pool }  = require('pg');
const path      = require('path');
const https     = require('https');

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
    outgoing_answered INT DEFAULT 0, missed_clients INT DEFAULT 0,
    recalled_clients INT DEFAULT 0, not_recalled_clients INT DEFAULT 0,
    answer_rate FLOAT DEFAULT 0, recall_rate FLOAT DEFAULT 0,
    no_recall_pct FLOAT DEFAULT 0, avg_recall_minutes FLOAT DEFAULT 0,
    h_09_11 INT DEFAULT 0, h_11_13 INT DEFAULT 0, h_13_15 INT DEFAULT 0,
    h_15_17 INT DEFAULT 0, h_17_19 INT DEFAULT 0, h_19_21 INT DEFAULT 0,
    h_21_23 INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  `;
  // Split into separate queries — PgBouncer doesn't support multi-statement
  await pool.query(`CREATE TABLE IF NOT EXISTS amo_call_daily_stats (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    stat_date DATE NOT NULL, manager_name TEXT NOT NULL,
    ${cols}, UNIQUE(stat_date, manager_name)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS amo_call_weekly_stats (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    week_start DATE NOT NULL, manager_name TEXT NOT NULL,
    ${cols}, UNIQUE(week_start, manager_name)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS amo_call_monthly_stats (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    month_start DATE NOT NULL, manager_name TEXT NOT NULL,
    ${cols}, UNIQUE(month_start, manager_name)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS amo_sync_logs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    synced_at TIMESTAMPTZ DEFAULT NOW(), status TEXT NOT NULL,
    manager TEXT, events_count INT, duration_ms INT, error_msg TEXT
  )`);
  console.log('DB ready');
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
  let table, dateField;
  if      (period === 'weekly')  { table = 'amo_call_weekly_stats';  dateField = 'week_start';  }
  else if (period === 'monthly') { table = 'amo_call_monthly_stats'; dateField = 'month_start'; }
  else                           { table = 'amo_call_daily_stats';   dateField = 'stat_date';   }
  try {
    const where = manager ? 'WHERE manager_name = $1' : '';
    const { rows } = await pool.query(
      `SELECT * FROM ${table} ${where} ORDER BY ${dateField} DESC LIMIT 1`,
      manager ? [manager] : []
    );
    res.json(rows[0] || null);
  } catch (e) { res.status(500).json({ error: e.message || String(e) }); }
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
  let inA = 0, outA = 0;

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
      outA++; if (slot) hours[slot]++;
      if (missed.has(cid)) {
        recalled.add(cid); missed.delete(cid);
        if (cid in missedAt) { gaps.push((ts - missedAt[cid]) / 60); delete missedAt[cid]; }
      }
    }
  }

  const m = missed.size + recalled.size, rc = recalled.size, nrc = missed.size;
  const total = inA + outA + m;
  return {
    total, incoming: inA, outgoing: outA, missed: m, recalled: rc, not_recalled: nrc,
    answer_rate:        total ? Math.round((inA + outA) / total * 100) : 0,
    recall_rate:        m ? Math.round(rc / m * 100) : 0,
    no_recall_pct:      m ? Math.round(nrc / m * 100) : 0,
    avg_recall_minutes: gaps.length
      ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length * 10) / 10 : 0,
    hours,
  };
}

async function upsert(table, uniqueCol, uniqueVal, managerName, st) {
  const h = st.hours;
  await pool.query(`
    INSERT INTO ${table}
      (id, ${uniqueCol}, manager_name,
       total_calls, incoming_answered, outgoing_answered,
       missed_clients, recalled_clients, not_recalled_clients,
       answer_rate, recall_rate, no_recall_pct, avg_recall_minutes,
       h_09_11, h_11_13, h_13_15, h_15_17, h_17_19, h_19_21, h_21_23,
       created_at, updated_at)
    VALUES (gen_random_uuid()::TEXT,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
            $13,$14,$15,$16,$17,$18,$19,NOW(),NOW())
    ON CONFLICT (${uniqueCol}, manager_name) DO UPDATE SET
      total_calls=$3, incoming_answered=$4, outgoing_answered=$5,
      missed_clients=$6, recalled_clients=$7, not_recalled_clients=$8,
      answer_rate=$9, recall_rate=$10, no_recall_pct=$11, avg_recall_minutes=$12,
      h_09_11=$13, h_11_13=$14, h_13_15=$15,
      h_15_17=$16, h_17_19=$17, h_19_21=$18, h_21_23=$19, updated_at=NOW()
  `, [
    uniqueVal, managerName,
    st.total, st.incoming, st.outgoing,
    st.missed, st.recalled, st.not_recalled,
    st.answer_rate, st.recall_rate, st.no_recall_pct, st.avg_recall_minutes,
    h['09:00-11:00']||0, h['11:00-13:00']||0, h['13:00-15:00']||0,
    h['15:00-17:00']||0, h['17:00-19:00']||0, h['19:00-21:00']||0, h['21:00-23:00']||0,
  ]);
}

async function runSync() {
  const t0 = Date.now();
  const targetIds = await getTargetUserIds();
  if (!Object.keys(targetIds).length)
    throw new Error('No managers found: ' + TARGET_MANAGERS.join(', '));

  const now = new Date();
  let yest = new Date(now);
  yest.setDate(yest.getDate() - 1);
  if (yest.getDay() === 0) yest.setDate(yest.getDate() - 1);

  const dayStart = new Date(yest); dayStart.setHours(0, 0, 0, 0);
  const dayEnd   = new Date(yest); dayEnd.setHours(23, 59, 59, 999);
  const wd = dayStart.getDay();
  const weekStart = new Date(dayStart);
  weekStart.setDate(dayStart.getDate() - (wd === 0 ? 6 : wd - 1));
  const monthStart = new Date(dayStart.getFullYear(), dayStart.getMonth(), 1);

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

    const d = d => d.toISOString().slice(0, 10);
    await upsert('amo_call_daily_stats',   'stat_date',  d(dayStart),  managerName, dSt);
    await upsert('amo_call_weekly_stats',  'week_start', d(weekStart), managerName, wSt);
    await upsert('amo_call_monthly_stats', 'month_start',d(monthStart),managerName, mSt);
  }

  const dur = Date.now() - t0;
  await pool.query(
    `INSERT INTO amo_sync_logs (id,synced_at,status,manager,events_count,duration_ms)
     VALUES (gen_random_uuid()::TEXT,NOW(),'success',$1,$2,$3)`,
    [Object.values(targetIds)[0], events.length, dur]
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
       VALUES (gen_random_uuid()::TEXT,NOW(),'error',$1,$2)`,
      [msg, 0]
    ).catch(() => {});
    res.status(500).json({ error: msg });
  }
});

app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ─── Self-heal nginx ──────────────────────────────────────────────────────────
function fixNginx(port) {
  const fs = require('fs');
  const { execSync } = require('child_process');
  const dirs = ['/etc/nginx/sites-enabled', '/etc/nginx/conf.d'];
  let patched = false;
  for (const dir of dirs) {
    let files;
    try { files = fs.readdirSync(dir); } catch { continue; }
    for (const f of files) {
      const fp = `${dir}/${f}`;
      try {
        const orig = fs.readFileSync(fp, 'utf8');
        const fixed = orig.replace(
          /proxy_pass\s+http:\/\/[a-zA-Z0-9._:-]+;/g,
          `proxy_pass http://127.0.0.1:${port};`
        );
        if (fixed !== orig) {
          fs.writeFileSync(fp, fixed);
          patched = true;
          console.log(`nginx patched: ${fp}`);
        }
      } catch {}
    }
  }
  if (patched) {
    try {
      execSync('nginx -t && nginx -s reload', { timeout: 8000, stdio: 'pipe' });
      console.log('nginx reloaded OK');
    } catch (e) { console.log('nginx reload:', e.message.slice(0, 80)); }
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────
function listenOn(port, main) {
  const srv = require('http').createServer(app);
  srv.listen(port, () => {
    console.log(`Listening on :${port}`);
    if (main) {
      console.log(`DATABASE_URL: ${(process.env.DATABASE_URL || '').slice(0, 60)}...`);
      initDb().catch(err => console.error('DB init warning:', err.message));
      fixNginx(port);
    }
  });
  srv.on('error', e => console.log(`Port ${port} ${e.code || e.message}`));
}

listenOn(PORT, true);
if (PORT !== 3000) listenOn(3000, false);
