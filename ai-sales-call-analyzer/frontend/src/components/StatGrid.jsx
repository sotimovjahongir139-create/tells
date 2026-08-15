import { formatDuration } from '../lib/format';

export default function StatGrid({ totals }) {
  const tiles = [
    { label: "Jami qo'ng'iroqlar", value: totals.totalCalls },
    { label: 'Tahlil qilingan', value: totals.analyzedCalls },
    { label: "O'rtacha AI baho", value: totals.avgScore !== null ? `${totals.avgScore} / 100` : '—' },
    { label: "O'rtacha davomiylik", value: formatDuration(totals.avgDurationSeconds) },
  ];

  return (
    <div className="stat-grid">
      {tiles.map((t) => (
        <div className="stat-tile" key={t.label}>
          <div className="label">{t.label}</div>
          <div className="value">{t.value}</div>
        </div>
      ))}
    </div>
  );
}
