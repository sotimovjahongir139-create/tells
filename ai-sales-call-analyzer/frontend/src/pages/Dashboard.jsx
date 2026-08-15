import { useEffect, useState, useCallback } from 'react';
import api from '../api/client';
import PeriodSwitcher from '../components/PeriodSwitcher';
import PeriodNav from '../components/PeriodNav';
import StatGrid from '../components/StatGrid';
import SkillsPanel from '../components/SkillsPanel';
import TopMistakesPanel from '../components/TopMistakesPanel';
import WeeklyBreakdown from '../components/WeeklyBreakdown';
import MonthlyBreakdown from '../components/MonthlyBreakdown';
import CallsTable from '../components/CallsTable';

export default function Dashboard() {
  const [period, setPeriod] = useState('daily');
  const [date, setDate] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (p, d) => {
    setLoading(true);
    setError('');
    try {
      const params = { period: p };
      if (d) params.date = d;
      const res = await api.get('/dashboard', { params });
      setData(res.data);
      setDate(res.data.selectedDate);
    } catch (err) {
      setError(err.response?.data?.error || 'Ma\'lumotlarni yuklashda xatolik yuz berdi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(period, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  function handlePeriodChange(p) {
    setPeriod(p);
  }

  function handlePrev() {
    if (data?.prevDate) load(period, data.prevDate);
  }

  function handleNext() {
    if (data?.nextDate) load(period, data.nextDate);
  }

  return (
    <div>
      <PeriodSwitcher period={period} onChange={handlePeriodChange} />

      {data && <PeriodNav label={data.range.label} onPrev={handlePrev} onNext={handleNext} />}

      {loading && <div className="empty-state">Yuklanmoqda...</div>}
      {error && <div className="error-text">{error}</div>}

      {!loading && data && (
        <>
          <StatGrid totals={data.totals} />

          <div className="call-detail-grid">
            <SkillsPanel skills={data.skills} />
            <TopMistakesPanel topMistakes={data.topMistakes} />
          </div>

          {period === 'weekly' && data.breakdown && <WeeklyBreakdown breakdown={data.breakdown} />}
          {period === 'monthly' && data.breakdown && <MonthlyBreakdown breakdown={data.breakdown} />}

          <div className="panel">
            <h3>Batafsil qo'ng'iroqlar</h3>
            {data.callsTotal > data.callsShown && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: -8, marginBottom: 16 }}>
                So'nggi {data.callsShown} ta ko'rsatilmoqda (jami {data.callsTotal} ta).
              </p>
            )}
            <CallsTable calls={data.calls} />
          </div>
        </>
      )}
    </div>
  );
}
