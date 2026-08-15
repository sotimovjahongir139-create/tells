const SKILL_LABELS = {
  communication: 'Muloqot',
  needDiscovery: 'Ehtiyojni aniqlash',
  productPresentation: 'Mahsulot taqdimoti',
  objectionHandling: "E'tiroz bilan ishlash",
  closing: 'Sotuvni yakunlash',
};

export default function SkillsPanel({ skills }) {
  const hasData = Object.values(skills).some((v) => v !== null);

  return (
    <div className="panel">
      <h3>AI ko'nikmalar</h3>
      {!hasData && <div className="empty-state">Hozircha ma'lumot mavjud emas.</div>}
      {hasData &&
        Object.entries(SKILL_LABELS).map(([key, label]) => {
          const value = skills[key];
          return (
            <div className="bar-row" key={key}>
              <span className="bar-label">{label}</span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${value ?? 0}%` }} />
              </div>
              <span className="bar-value">{value ?? '—'}</span>
            </div>
          );
        })}
    </div>
  );
}
