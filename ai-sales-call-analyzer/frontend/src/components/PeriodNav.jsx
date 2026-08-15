export default function PeriodNav({ label, onPrev, onNext }) {
  return (
    <div className="period-nav">
      <button onClick={onPrev}>← Oldingi</button>
      <span className="range-label">{label}</span>
      <button onClick={onNext}>Keyingi →</button>
    </div>
  );
}
