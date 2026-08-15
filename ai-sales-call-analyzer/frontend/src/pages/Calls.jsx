import { useEffect, useState } from 'react';
import api from '../api/client';
import CallsTable from '../components/CallsTable';

export default function Calls() {
  const [calls, setCalls] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/calls')
      .then((res) => {
        setTotal(res.data.total);
        setCalls(
          res.data.calls.map((c) => ({
            ...c,
            overallScore: c.analysis?.overallScore ?? null,
          }))
        );
      })
      .catch((err) => setError(err.response?.data?.error || "Ma'lumotlarni yuklashda xatolik yuz berdi."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="panel">
        <h3>Barcha qo'ng'iroqlar</h3>
        {!loading && !error && total > calls.length && (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: -8, marginBottom: 16 }}>
            So'nggi {calls.length} ta ko'rsatilmoqda (jami {total} ta).
          </p>
        )}
        {loading && <div className="empty-state">Yuklanmoqda...</div>}
        {error && <div className="error-text">{error}</div>}
        {!loading && !error && <CallsTable calls={calls} />}
      </div>
    </div>
  );
}
