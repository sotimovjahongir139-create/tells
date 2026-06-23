const API = '/api';

/* Uzbek Latin month names */
const UZ_MONTHS_SHORT = ['Yan','Fev','Mar','Apr','May','Iyn','Iyl','Avg','Sen','Okt','Noy','Dek'];
const UZ_MONTHS_LONG  = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentyabr','Oktyabr','Noyabr','Dekabr'];

const state = {
  tab: 'daily',
  dailyDate: '',
  weeklyWeek: '',
  monthlyMonth: '',
};

/* ── Boot ───────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  setupRefresh();
  await loadAllPeriods();
  await loadStats();
});

/* ── Tab switching ──────────────────────────────────── */
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const tab = btn.dataset.tab;
      if (tab === state.tab) return;

      state.tab = tab;

      document.querySelectorAll('.tab-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.tab === tab);
        b.setAttribute('aria-selected', b.dataset.tab === tab);
      });

      ['daily', 'weekly', 'monthly'].forEach((t) => {
        const el = document.getElementById(`${t}-period`);
        if (el) el.classList.toggle('hidden', t !== tab);
      });

      await loadStats();
    });
  });
}

function setupRefresh() {
  document.getElementById('btn-refresh').addEventListener('click', () => loadStats());
}

/* ── Load period dropdowns ──────────────────────────── */
async function loadAllPeriods() {
  const [datesRes, weeksRes, monthsRes] = await Promise.allSettled([
    apiFetch('/stats/daily/dates'),
    apiFetch('/stats/weekly/weeks'),
    apiFetch('/stats/monthly/months'),
  ]);

  /* Daily dates — pg returns DATE as "YYYY-MM-DD" string */
  if (datesRes.status === 'fulfilled' && datesRes.value.success) {
    const dates = datesRes.value.data;
    populateSelect('daily-date-select', dates, (d) => ({
      value: toIsoDate(d),
      label: fmtDate(d),
    }));
    if (dates.length) state.dailyDate = toIsoDate(dates[0]);
  }

  /* Weekly — stat_week, period_start, period_end all DATE strings */
  if (weeksRes.status === 'fulfilled' && weeksRes.value.success) {
    const weeks = weeksRes.value.data;
    populateSelect('weekly-week-select', weeks, (w) => ({
      value: toIsoDate(w.stat_week),
      label: `${fmtDate(w.period_start)} – ${fmtDate(w.period_end)}`,
    }));
    if (weeks.length) state.weeklyWeek = toIsoDate(weeks[0].stat_week);
  }

  /* Monthly — stat_month DATE string */
  if (monthsRes.status === 'fulfilled' && monthsRes.value.success) {
    const months = monthsRes.value.data;
    populateSelect('monthly-month-select', months, (m) => ({
      value: toIsoDate(m.stat_month),
      label: fmtMonth(m.stat_month),
    }));
    if (months.length) state.monthlyMonth = toIsoDate(months[0].stat_month);
  }

  document.getElementById('daily-date-select').addEventListener('change', async (e) => {
    state.dailyDate = e.target.value;
    if (state.tab === 'daily') await loadStats();
  });

  document.getElementById('weekly-week-select').addEventListener('change', async (e) => {
    state.weeklyWeek = e.target.value;
    if (state.tab === 'weekly') await loadStats();
  });

  document.getElementById('monthly-month-select').addEventListener('change', async (e) => {
    state.monthlyMonth = e.target.value;
    if (state.tab === 'monthly') await loadStats();
  });
}

/* ── Load and render stats ──────────────────────────── */
async function loadStats() {
  const grid = document.getElementById('stats-grid');
  const icon = document.getElementById('refresh-icon');
  icon.classList.add('spinning');
  setGrid(grid, 'loading');

  try {
    let path;

    if (state.tab === 'daily') {
      path = `/stats/daily${state.dailyDate ? `?date=${state.dailyDate}` : ''}`;
      setPeriodLabel(selText('daily-date-select') || 'Oxirgi sana');
    } else if (state.tab === 'weekly') {
      path = `/stats/weekly${state.weeklyWeek ? `?week=${state.weeklyWeek}` : ''}`;
      setPeriodLabel(selText('weekly-week-select') || 'Oxirgi hafta');
    } else {
      path = `/stats/monthly${state.monthlyMonth ? `?month=${state.monthlyMonth}` : ''}`;
      setPeriodLabel(selText('monthly-month-select') || 'Oxirgi oy');
    }

    const json = await apiFetch(path);
    if (!json.success) throw new Error(json.error || 'API xatosi');

    if (!json.data.length) {
      setGrid(grid, 'empty');
      return;
    }

    grid.innerHTML = '';
    json.data.forEach((m) => grid.appendChild(buildCard(m)));
  } catch (err) {
    setGrid(grid, 'error', err.message);
  } finally {
    icon.classList.remove('spinning');
  }
}

function setPeriodLabel(text) {
  document.getElementById('period-label-display').textContent = `Ko'rsatilmoqda: ${text}`;
}

function selText(id) {
  const sel = document.getElementById(id);
  return sel?.options[sel.selectedIndex]?.text || '';
}

function setGrid(grid, type, msg = '') {
  if (type === 'loading') {
    grid.innerHTML = `<div class="state-card"><div class="spinner"></div><p>Yuklanmoqda&hellip;</p></div>`;
  } else if (type === 'empty') {
    grid.innerHTML = `<div class="state-card"><p>Ushbu davr uchun ma'lumot yo'q.</p></div>`;
  } else if (type === 'error') {
    grid.innerHTML = `<div class="state-card error"><p>&#9888; ${escHtml(msg)}</p></div>`;
  }
}

/* ── Build manager card ─────────────────────────────── */
function buildCard(m) {
  const total       = num(m.total_calls);
  const incoming    = num(m.incoming_answered);
  const outgoing    = num(m.outgoing_answered);
  const missed      = num(m.missed_clients);
  const recalled    = num(m.recalled_clients);
  const notRecalled = num(m.not_recalled_clients);
  const answerRate  = pct(m.answer_rate);
  const recallRate  = pct(m.recall_rate);
  const noRecallPct = pct(m.no_recall_pct);
  const avgRecall   = parseFloat(m.avg_recall_minutes) || 0;

  const answerCls   = rateColor(answerRate, 80, 60);
  const recallCls   = rateColor(recallRate, 70, 50);
  const noRecallCls = rateColorInv(noRecallPct, 20, 40);
  const avgCls      = rateColorInv(avgRecall, 30, 60);

  const hours = [
    { lbl: '09‑11', v: num(m.h_09_11) },
    { lbl: '11‑13', v: num(m.h_11_13) },
    { lbl: '13‑15', v: num(m.h_13_15) },
    { lbl: '15‑17', v: num(m.h_15_17) },
    { lbl: '17‑19', v: num(m.h_17_19) },
    { lbl: '19‑21', v: num(m.h_19_21) },
    { lbl: '21‑23', v: num(m.h_21_23) },
  ];
  const maxH = Math.max(...hours.map((h) => h.v), 1);

  const card = document.createElement('div');
  card.className = 'manager-card';
  card.innerHTML = `
    <div class="card-header">
      <span class="manager-name">${escHtml(m.manager_name)}</span>
      <div style="text-align:right">
        <div class="manager-total">${total}</div>
        <div class="manager-total-label">Jami<br>qo'ng'iroq</div>
      </div>
    </div>

    <div class="card-body">

      <div>
        <div class="rate-row">
          <span class="rate-label">Javob darajasi</span>
          <div class="progress-track">
            <div class="progress-fill ${answerCls}" style="width:${Math.min(answerRate,100)}%"></div>
          </div>
          <span class="rate-value val-${answerCls}">${answerRate.toFixed(1)}%</span>
        </div>
      </div>

      <div class="stat-grid">
        <div class="stat-block">
          <div class="stat-block-label">Kiruvchi javoblangan</div>
          <div class="stat-block-value">${incoming}</div>
        </div>
        <div class="stat-block">
          <div class="stat-block-label">Chiquvchi javoblangan</div>
          <div class="stat-block-value">${outgoing}</div>
        </div>
      </div>

      <div class="stat-grid">
        <div class="stat-block">
          <div class="stat-block-label">O'tkazib yuborilgan</div>
          <div class="stat-block-value val-bad">${missed}</div>
        </div>
        <div class="stat-block">
          <div class="stat-block-label">Qayta qo'ng'iroq qilingan</div>
          <div class="stat-block-value val-${recallCls}">${recalled}
            <span class="badge badge-${recallCls}">${recallRate.toFixed(0)}%</span>
          </div>
        </div>
      </div>

      <div class="stat-grid">
        <div class="stat-block">
          <div class="stat-block-label">Qayta qo'ng'iroq qilinmagan</div>
          <div class="stat-block-value val-${noRecallCls}">${notRecalled}
            <span class="badge badge-${noRecallCls}">${noRecallPct.toFixed(0)}%</span>
          </div>
        </div>
        <div class="stat-block">
          <div class="stat-block-label">O'rtacha qayta qo'ng'iroq vaqti</div>
          <div class="stat-block-value val-${avgCls}">${avgRecall.toFixed(0)} min</div>
        </div>
      </div>

      <div class="card-divider"></div>

      <div class="chart-section">
        <span class="chart-title">Soatlik taqsimot</span>
        <div class="chart">
          ${hours.map((h) => `
            <div class="bar-wrap">
              <div class="bar-inner">
                <div class="bar" style="height:${barPct(h.v, maxH)}%"></div>
              </div>
              <span class="bar-val">${h.v}</span>
              <span class="bar-lbl">${h.lbl}</span>
            </div>
          `).join('')}
        </div>
      </div>

    </div>
  `;
  return card;
}

/* ── Color helpers ──────────────────────────────────── */
function rateColor(v, good, med) {
  return v >= good ? 'good' : v >= med ? 'medium' : 'bad';
}
function rateColorInv(v, good, med) {
  return v <= good ? 'good' : v <= med ? 'medium' : 'bad';
}

/* ── Value helpers ──────────────────────────────────── */
function num(v)   { return parseInt(v, 10) || 0; }
function pct(v)   { return parseFloat(v) || 0; }
function barPct(v, max) { return max === 0 ? 0 : Math.max(Math.round((v / max) * 100), v > 0 ? 4 : 0); }

/* ── Date helpers (timezone-safe — parse string directly, never use new Date()) ── */
function toIsoDate(d) {
  if (!d) return '';
  return String(d).split('T')[0]; // "2026-06-15T00:00:00.000Z" → "2026-06-15"
}

function parseDateParts(d) {
  const s = toIsoDate(d);
  if (!s) return null;
  const parts = s.split('-').map(Number);
  return { y: parts[0], m: parts[1], d: parts[2] };
}

function fmtDate(d) {
  const p = parseDateParts(d);
  if (!p) return '';
  return `${p.d} ${UZ_MONTHS_SHORT[p.m - 1]} ${p.y}`;
}

function fmtMonth(d) {
  const p = parseDateParts(d);
  if (!p) return '';
  return `${UZ_MONTHS_LONG[p.m - 1]} ${p.y}`;
}

/* ── DOM helpers ────────────────────────────────────── */
function populateSelect(id, items, mapper) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = '';
  items.forEach((item) => {
    const { value, label } = mapper(item);
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    sel.appendChild(opt);
  });
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = String(str ?? '');
  return d.innerHTML;
}

/* ── API ────────────────────────────────────────────── */
async function apiFetch(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`);
  }
  return res.json();
}
