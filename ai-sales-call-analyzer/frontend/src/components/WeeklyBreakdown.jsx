import { scoreColor } from '../lib/format';

export default function WeeklyBreakdown({ breakdown }) {
  return (
    <div className="panel">
      <h3>Hafta kunlari</h3>
      <div className="weekday-grid">
        {breakdown.map((day) => (
          <div className="weekday-card" key={day.date}>
            <div className="day-label">{day.label}</div>
            <div className="day-calls">{day.totalCalls}</div>
            <div className="day-score" style={{ color: day.avgScore !== null ? scoreColor(day.avgScore) : undefined }}>
              {day.avgScore !== null ? `${day.avgScore} ball` : "Ma'lumot yo'q"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
