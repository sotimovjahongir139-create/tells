import { useNavigate } from 'react-router-dom';
import { formatDuration, formatTimeUz, scoreColor, ANALYSIS_STATUS_LABELS, DIRECTION_LABELS } from '../lib/format';

export default function CallsTable({ calls }) {
  const navigate = useNavigate();

  if (!calls || calls.length === 0) {
    return <div className="empty-state">Hozircha ma'lumot mavjud emas.</div>;
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Vaqt</th>
          <th>Mijoz</th>
          <th>Yo'nalish</th>
          <th>Davomiylik</th>
          <th>AI baho</th>
          <th>Holat</th>
        </tr>
      </thead>
      <tbody>
        {calls.map((call) => (
          <tr key={call.id} onClick={() => navigate(`/calls/${call.id}`)}>
            <td>{formatTimeUz(call.startedAt)}</td>
            <td>{call.customerName || call.customerPhone || "Noma'lum"}</td>
            <td>{DIRECTION_LABELS[call.direction] || call.direction}</td>
            <td>{formatDuration(call.durationSeconds)}</td>
            <td>
              {call.overallScore !== null ? (
                <span className="score-badge" style={{ background: scoreColor(call.overallScore) }}>
                  {call.overallScore}
                </span>
              ) : (
                '—'
              )}
            </td>
            <td className="status-tag">{ANALYSIS_STATUS_LABELS[call.analysisStatus] || call.analysisStatus}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
