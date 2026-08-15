export default function TopMistakesPanel({ topMistakes }) {
  const max = topMistakes.length ? Math.max(...topMistakes.map((m) => m.count)) : 0;

  return (
    <div className="panel">
      <h3>Eng ko'p uchragan xatolar</h3>
      {topMistakes.length === 0 && <div className="empty-state">Hozircha ma'lumot mavjud emas.</div>}
      {topMistakes.map((m) => (
        <div className="bar-row" key={m.category}>
          <span className="bar-label">{m.category}</span>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${max ? (m.count / max) * 100 : 0}%` }} />
          </div>
          <span className="bar-value">{m.count} ta</span>
        </div>
      ))}
    </div>
  );
}
