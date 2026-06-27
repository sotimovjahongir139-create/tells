'use strict';

let currentPeriod = 'daily';
let hourChart = null;

async function get(url) {
  const r = await fetch(url);
  return r.ok ? r.json() : null;
}

function rateColor(v) {
  if (v >= 80) return '#22c55e';
  if (v >= 60) return '#eab308';
  return '#ef4444';
}

function svgGauge(pct) {
  const r = 38, circ = +(2 * Math.PI * r).toFixed(2);
  const off = +(circ - Math.min(pct, 100) / 100 * circ).toFixed(2);
  const color = rateColor(pct);
  return `<svg viewBox="0 0 100 100" aria-label="${pct}%">
    <circle cx="50" cy="50" r="${r}" fill="none" stroke="#1f2937" stroke-width="10"/>
    <circle cx="50" cy="50" r="${r}" fill="none" stroke="${color}" stroke-width="10"
      stroke-dasharray="${circ}" stroke-dashoffset="${off}"
      stroke-linecap="round" transform="rotate(-90 50 50)"/>
    <text x="50" y="50" text-anchor="middle" dominant-baseline="central"
      fill="white" font-size="18" font-weight="bold">${pct}%</text>
  </svg>`;
}

function card(label, value, unit, colorClass) {
  const unitHtml = unit ? `<span class="card-unit"> ${unit}</span>` : '';
  const cls = colorClass ? ` ${colorClass}` : '';
  return `<div class="card">
    <span class="card-label">${label}</span>
    <div class="card-value${cls}">${value}${unitHtml}</div>
  </div>`;
}

function periodLabel(period, stat) {
  if (!stat) return '';
  const UZ_MONTHS = ['Yanvar','Fevral','Mart','Aprel','May','Iyun',
                     'Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];
  if (period === 'daily') {
    const d = (stat.stat_date || '').split('T')[0];
    return `Sana: ${d} · ${stat.manager_name || ''}`;
  }
  if (period === 'weekly') {
    const d = (stat.week_start || '').split('T')[0];
    return `Hafta boshi: ${d} · ${stat.manager_name || ''}`;
  }
  const raw = (stat.month_start || '').split('T')[0];
  if (raw) {
    const [y, m] = raw.split('-');
    return `${UZ_MONTHS[+m - 1]} ${y} · ${stat.manager_name || ''}`;
  }
  return stat.manager_name || '';
}

function renderSync(sync) {
  const wrap = document.getElementById('sync-wrap');
  let rowHtml = '';
  if (sync) {
    const dt = new Date(sync.synced_at).toLocaleString('uz', { dateStyle: 'short', timeStyle: 'short' });
    const cls = sync.status === 'success' ? 'badge-ok' : 'badge-err';
    const lbl = sync.status === 'success' ? 'Muvaffaqiyatli' : 'Xato';
    const meta = sync.events_count != null ? `<span class="sync-meta">${sync.events_count} event</span>` : '';
    rowHtml = `<div class="sync-row">
      <span class="sync-time">${dt}</span>
      <span class="badge ${cls}">${lbl}</span>
      ${meta}
    </div>`;
  }
  wrap.innerHTML = `
    ${rowHtml}
    <div id="sync-msg"></div>
    <button id="sync-btn" onclick="triggerSync()">Sinxronizatsiya</button>`;
}

window.triggerSync = async function () {
  const btn = document.getElementById('sync-btn');
  const msg = document.getElementById('sync-msg');
  btn.disabled = true;
  btn.textContent = 'Sinxronlanmoqda...';
  msg.textContent = '';
  msg.className = '';
  try {
    const res = await fetch('/api/sync', { method: 'POST', headers: { 'x-sync-source': 'ui' } });
    const data = await res.json();
    if (res.ok) {
      msg.className = 'msg-ok';
      msg.textContent = `✓ ${data.eventsCount ?? 0} ta event sinxronlandi`;
      await render(currentPeriod);
    } else {
      msg.className = 'msg-err';
      msg.textContent = `✗ ${data.error || 'Xato'}`;
    }
  } catch {
    document.getElementById('sync-msg').className = 'msg-err';
    document.getElementById('sync-msg').textContent = '✗ Ulanish xatosi';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sinxronizatsiya';
  }
};

async function render(period) {
  const [stat, sync] = await Promise.all([
    get(`/api/stats?period=${period}`),
    get('/api/sync/status'),
  ]);

  renderSync(sync);
  document.getElementById('period-label').textContent = periodLabel(period, stat);

  const noData  = document.getElementById('no-data');
  const content = document.getElementById('content');

  if (!stat) {
    noData.classList.remove('hidden');
    content.classList.add('hidden');
    return;
  }

  noData.classList.add('hidden');
  content.classList.remove('hidden');

  // Cards
  document.getElementById('main-cards').innerHTML =
    card("Jami qo'ng'iroqlar",   stat.total_calls,           '', 'blue')  +
    card('Kiruvchi (javob)',      stat.incoming_answered,     '', 'green') +
    card('Chiquvchi (javob)',     stat.outgoing_answered,     '', 'green') +
    card("O'tkazib yuborilgan",   stat.missed_clients,        '', 'red')   +
    card('Qayta chiqilmagan',     stat.not_recalled_clients,  '', 'red')   +
    card("O'rtacha qayta aloqa",  stat.avg_recall_minutes, 'daqiqa', '');

  // Gauges
  document.getElementById('gauges').innerHTML =
    `<div class="card gauge-card">
       <span class="card-label">Javob berish foizi</span>
       ${svgGauge(stat.answer_rate || 0)}
     </div>
     <div class="card gauge-card">
       <span class="card-label">Qayta chiqish foizi</span>
       ${svgGauge(stat.recall_rate || 0)}
     </div>`;

  // Hourly chart
  const labels = ['09–11','11–13','13–15','15–17','17–19','19–21','21–23'];
  const values = [
    stat.h_09_11, stat.h_11_13, stat.h_13_15,
    stat.h_15_17, stat.h_17_19, stat.h_19_21, stat.h_21_23,
  ];
  const maxVal = Math.max(...values, 1);
  const colors = values.map(v => v === maxVal ? '#f59e0b' : '#3b82f6');

  const datalabelsPlugin = {
    id: 'barDatalabels',
    afterDatasetsDraw(chart) {
      const ctx = chart.ctx;
      chart.data.datasets.forEach((dataset, i) => {
        chart.getDatasetMeta(i).data.forEach((bar, j) => {
          const val = dataset.data[j];
          if (!val) return;
          ctx.fillStyle = '#e5e7eb';
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(val, bar.x, bar.y - 3);
        });
      });
    },
  };

  if (hourChart) hourChart.destroy();
  hourChart = new Chart(document.getElementById('hour-chart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderRadius: 4 }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.raw} qo'ng'iroq` } },
      },
      scales: {
        x: { grid: { color: '#1f2937' }, ticks: { color: '#9ca3af', font: { size: 11 } } },
        y: { grid: { color: '#1f2937' }, ticks: { color: '#9ca3af', font: { size: 11 } } },
      },
    },
    plugins: [datalabelsPlugin],
  });
}

// Tab switching
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const period = btn.dataset.period;
    const debtSection = document.getElementById('debt-section');
    if (period === 'debt') {
      document.getElementById('no-data').classList.add('hidden');
      document.getElementById('content').classList.add('hidden');
      document.getElementById('period-label').textContent = '';
      debtSection.classList.remove('hidden');
      loadDebts();
    } else {
      debtSection.classList.add('hidden');
      currentPeriod = period;
      render(currentPeriod);
    }
  });
});

render('daily');

// ─── Qarzdorlik ───────────────────────────────────────────────────────────────
function debtRowClass(days) {
  if (days <= 1)  return 'row-darkred';
  if (days === 2) return 'row-red';
  if (days === 3) return 'row-orange';
  if (days === 4) return 'row-yellow';
  return '';
}

async function loadDebts() {
  const wrap = document.getElementById('debt-table-wrap');
  const debts = await get('/api/debts');
  if (!debts || !debts.length) {
    wrap.innerHTML = '<p id="debt-empty">Qarzdorlik yo\'q</p>';
    return;
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const rows = debts.map(d => {
    const sana = new Date(d.kelishilgan_sana); sana.setHours(0, 0, 0, 0);
    const days = Math.round((sana - today) / 86400000);
    const cls  = debtRowClass(days);
    const dayStr = days < 0
      ? `${Math.abs(days)} kun kech`
      : days === 0 ? 'Bugun muddati' : `${days} kun qoldi`;
    const sum     = Number(d.qarzdorlik_summasi).toLocaleString('uz');
    const sanaStr = (d.kelishilgan_sana || '').split('T')[0];
    return `<tr class="${cls}">
      <td>${d.mijoz_nomi}</td>
      <td>${d.mahsulot}</td>
      <td>${sum}</td>
      <td>${sanaStr}</td>
      <td>${dayStr}</td>
      <td><button class="debt-del-btn" onclick="deleteDebt(${d.id})" title="O'chirish">✕</button></td>
    </tr>`;
  }).join('');
  wrap.innerHTML = `<div class="debt-table-outer"><table class="debt-table">
    <thead><tr>
      <th>Mijoz nomi</th><th>Mahsulot</th><th>Summa</th>
      <th>Kelishilgan sana</th><th>Holati</th><th></th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

window.deleteDebt = async function(id) {
  if (!confirm('O\'chirilsinmi?')) return;
  await fetch(`/api/debts/${id}`, { method: 'DELETE' });
  loadDebts();
};

window.debtFormReset = function() {
  document.getElementById('debt-form').reset();
};

document.getElementById('debt-form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.target.querySelector('.btn-save');
  btn.disabled = true;
  const body = {
    mijoz_nomi:          document.getElementById('d-mijoz').value.trim(),
    mahsulot:            document.getElementById('d-mahsulot').value.trim(),
    qarzdorlik_summasi:  document.getElementById('d-summa').value,
    kelishilgan_sana:    document.getElementById('d-sana').value,
  };
  try {
    const r = await fetch('/api/debts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.ok) { document.getElementById('debt-form').reset(); loadDebts(); }
  } finally { btn.disabled = false; }
});
