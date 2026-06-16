/* global API base — on DO App Platform /api is proxied to the backend service */
const API = '/api';

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

/* ── Refresh button ─────────────────────────────────── */
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

  if (datesRes.status === 'fulfilled' && datesRes.value.success) {
    const dates = datesRes.value.data;
    populateSelect('daily-date-select', dates, (d) => ({
      value: isoDate(d),
      label: formatDisplayDate(d),
    }));
    if (dates.length) state.dailyDate = isoDate(dates[0]);
  }

  if (weeksRes.status === 'fulfilled' && weeksRes.value.success) {
    const weeks = weeksRes.value.data;
    populateSelect('weekly-week-select', weeks, (w) => ({
      value: w.stat_week,
      label: `${w.stat_week}  (${formatDisplayDate(w.period_start)} – ${formatDisplayDate(w.period_end)})`,
    }));
    if (weeks.length) state.weeklyWeek = weeks[0].stat_week;
  }

  if (monthsRes.status === 'fulfilled' && monthsRes.value.success) {
    const months = monthsRes.value.data;
    populateSelect('monthly-month-select', months, (m) => ({
      value: m.stat_month,
      label: formatMonth(m.stat_month),
    }));
    if (months.length) state.monthlyMonth = months[0].stat_month;
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
    let periodText = '';

    if (state.tab === 'daily') {
      path = `/stats/daily${state.dailyDate ? `?date=${state.dailyDate}` : ''}`;
      periodText = state.dailyDate ? `Showing: ${formatDisplayDate(state.dailyDate)}` : 'Showing: latest available date';
    } else if (state.tab === 'weekly') {
      path = `/stats/weekly${state.weeklyWeek ? `?week=${state.weeklyWeek}` : ''}`;
      periodText = state.weeklyWeek ? `Showing: ${state.weeklyWeek}` : 'Showing: latest week';
    } else {
      path = `/stats/monthly${state.monthlyMonth ? `?month=${state.monthlyMonth}` : ''}`;
      periodText = state.monthlyMonth ? `Showing: ${formatMonth(state.monthlyMonth)}` : 'Showing: latest month';
    }

    document.getElementById('period-label-display').textContent = periodText;

    const json = await apiFetch(path);
    if (!json.success) throw new Error(json.error || 'API error');

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

function setGrid(grid, type, msg = '') {
  if (type === 'loading') {
    grid.innerHTML = `<div class="state-card"><div class="spinner"></div><p>Loading&hellip;</p></div>`;
  } else if (type === 'empty') {
    grid.innerHTML = `<div class="state-card"><p>No data for this period.</p></div>`;
  } else if (type === 'error') {
    grid.innerHTML = `<div class="state-card error"><p>&#9888; ${escHtml(msg)}</p></div>`;
  }
}

/* ── Build manager card ─────────────────────────────── */
function buildCard(m) {
  const total          = num(m.total_calls);
  const incoming       = num(m.incoming_answered);
  const outgoing       = num(m.outgoing_answered);
  const missed         = num(m.missed_clients);
  const recalled       = num(m.recalled_clients);
  const notRecalled    = num(m.not_recalled_clients);
  const answerRate     = pct(m.answer_rate);
  const recallRate     = pct(m.recall_rate);
  const noRecallPct    = pct(m.no_recall_pct);
  const avgRecall      = parseFloat(m.avg_recall_minutes) || 0;

  const answerCls  = rateColor(answerRate, 80, 60);
  const recallCls  = rateColor(recallRate, 70, 50);
  const noRecallCls = rateColorInv(noRecallPct, 20, 40);
  const avgCls     = rateColorInv(avgRecall, 30, 60);

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
        <div class="manager-total-label">Total<br>Calls</div>
      </div>
    </div>

    <div class="card-body">

      <!-- Answer rate bar -->
      <div>
        <div class="rate-row">
          <span class="rate-label">Answer Rate</span>
          <div class="progress-track" style="flex:1">
            <div class="progress-fill ${answerCls}" style="width:${Math.min(answerRate,100)}%"></div>
          </div>
          <span class="rate-value val-${answerCls}">${answerRate.toFixed(1)}%</span>
        </div>
      </div>

      <!-- Incoming / Outgoing -->
      <div class="stat-grid">
        <div class="stat-block">
          <div class="stat-block-label">Incoming answered</div>
          <div class="stat-block-value">${incoming}</div>
        </div>
        <div class="stat-block">
          <div class="stat-block-label">Outgoing answered</div>
          <div class="stat-block-value">${outgoing}</div>
        </div>
      </div>

      <!-- Missed / Recalled -->
      <div class="stat-grid">
        <div class="stat-block">
          <div class="stat-block-label">Missed clients</div>
          <div class="stat-block-value val-bad">${missed}</div>
        </div>
        <div class="stat-block">
          <div class="stat-block-label">Recalled</div>
          <div class="stat-block-value val-${recallCls}">${recalled}
            <span class="badge badge-${recallCls}" style="font-size:0.65rem">${recallRate.toFixed(0)}%</span>
          </div>
        </div>
      </div>

      <!-- Not recalled / Avg recall -->
      <div class="stat-grid">
        <div class="stat-block">
          <div class="stat-block-label">Not recalled</div>
          <div class="stat-block-value val-${noRecallCls}">${notRecalled}
            <span class="badge badge-${noRecallCls}" style="font-size:0.65rem">${noRecallPct.toFixed(0)}%</span>
          </div>
        </div>
        <div class="stat-block">
          <div class="stat-block-label">Avg recall time</div>
          <div class="stat-block-value val-${avgCls}">${avgRecall.toFixed(0)} min</div>
        </div>
      </div>

      <div class="card-divider"></div>

      <!-- Hourly chart -->
      <div class="chart-section">
        <span class="chart-title">Hourly Distribution</span>
        <div class="chart">
          ${hours.map((h) => `
            <div class="bar-wrap">
              <div class="bar-inner">
                <div class="bar" style="height:${pctH(h.v, maxH)}%"></div>
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
  if (v >= good) return 'good';
  if (v >= med)  return 'medium';
  return 'bad';
}
function rateColorInv(v, good, med) {
  if (v <= good) return 'good';
  if (v <= med)  return 'medium';
  return 'bad';
}

/* ── Value helpers ──────────────────────────────────── */
function num(v)   { return parseInt(v, 10) || 0; }
function pct(v)   { return parseFloat(v) || 0; }
function pctH(v, max) { return max === 0 ? 0 : Math.max(Math.round((v / max) * 100), v > 0 ? 4 : 0); }

/* ── Date formatting ────────────────────────────────── */
function isoDate(d) {
  if (!d) return '';
  return new Date(d).toISOString().split('T')[0];
}

function formatDisplayDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatMonth(m) {
  if (!m) return '';
  const [year, month] = String(m).split('-');
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${names[parseInt(month, 10) - 1] || month} ${year}`;
}

/* ── DOM helpers ────────────────────────────────────── */
function populateSelect(id, items, mapper) {
  const sel = document.getElementById(id);
  if (!sel) return;
  const opts = items.map((item) => {
    const { value, label } = mapper(item);
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    return opt;
  });
  sel.innerHTML = '';
  opts.forEach((o) => sel.appendChild(o));
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
