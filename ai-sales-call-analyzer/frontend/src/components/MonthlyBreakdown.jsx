export default function MonthlyBreakdown({ breakdown }) {
  const max = Math.max(1, ...breakdown.map((d) => d.totalCalls));

  return (
    <div className="panel">
      <h3>Oylik tendensiya</h3>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 140, overflowX: 'auto' }}>
        {breakdown.map((day) => (
          <div
            key={day.date}
            title={`${day.label}: ${day.totalCalls} qo'ng'iroq${day.avgScore !== null ? `, ${day.avgScore} ball` : ''}`}
            style={{ flex: '0 0 auto', width: 16, display: 'flex', flexDirection: 'column', alignItems: 'center' }}
          >
            <div
              style={{
                width: 10,
                height: Math.max(2, (day.totalCalls / max) * 100),
                background: 'var(--accent)',
                borderRadius: 3,
              }}
            />
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>{day.date.slice(-2)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
