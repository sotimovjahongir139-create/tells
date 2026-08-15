const PERIODS = [
  { key: 'daily', label: 'Kunlik' },
  { key: 'weekly', label: 'Haftalik' },
  { key: 'monthly', label: 'Oylik' },
];

export default function PeriodSwitcher({ period, onChange }) {
  return (
    <div className="period-switcher">
      {PERIODS.map((p) => (
        <button
          key={p.key}
          className={`period-btn${period === p.key ? ' active' : ''}`}
          onClick={() => onChange(p.key)}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
