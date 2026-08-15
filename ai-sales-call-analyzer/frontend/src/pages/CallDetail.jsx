import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import { formatDateTimeUz, formatDuration, scoreColor, DIRECTION_LABELS } from '../lib/format';

const SKILL_LABELS = {
  communication: 'Muloqot',
  needDiscovery: 'Ehtiyojni aniqlash',
  productPresentation: 'Mahsulot taqdimoti',
  objectionHandling: "E'tiroz bilan ishlash",
  closing: 'Sotuvni yakunlash',
};

const SEVERITY_COLORS = {
  low: 'var(--good)',
  medium: 'var(--warning)',
  high: 'var(--critical)',
};

const SEVERITY_LABELS = { low: 'Past', medium: "O'rta", high: 'Yuqori' };

export default function CallDetail() {
  const { id } = useParams();
  const [call, setCall] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [analyzing, setAnalyzing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/calls/${id}`);
      setCall(res.data.call);
    } catch (err) {
      setError(err.response?.data?.error || "Ma'lumotlarni yuklashda xatolik yuz berdi.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAnalyze() {
    setAnalyzing(true);
    setError('');
    setCall((c) => ({ ...c, analysisStatus: 'PROCESSING' }));
    try {
      const res = await api.post(`/calls/${id}/analyze`);
      setCall(res.data.call);
    } catch (err) {
      setError(err.response?.data?.error || 'Tahlilda xatolik yuz berdi.');
      await load();
    } finally {
      setAnalyzing(false);
    }
  }

  if (loading) return <div className="empty-state">Yuklanmoqda...</div>;
  if (!call) return <div className="error-text">{error || 'Qo\'ng\'iroq topilmadi.'}</div>;

  const analysis = call.analysis;

  return (
    <div>
      <Link to="/calls" style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
        ← Qo'ng'iroqlarga qaytish
      </Link>

      <div className="panel" style={{ marginTop: 12 }}>
        <div className="call-detail-grid">
          <div>
            <dl>
              <dt style={{ color: 'var(--text-muted)', fontSize: 12 }}>Sotuvchi</dt>
              <dd style={{ margin: '2px 0 12px' }}>{call.salesperson?.name}</dd>
              <dt style={{ color: 'var(--text-muted)', fontSize: 12 }}>Mijoz</dt>
              <dd style={{ margin: '2px 0 12px' }}>{call.customerName || call.customerPhone || "Noma'lum"}</dd>
              <dt style={{ color: 'var(--text-muted)', fontSize: 12 }}>Sana va vaqt</dt>
              <dd style={{ margin: '2px 0 12px' }}>{formatDateTimeUz(call.startedAt)}</dd>
              <dt style={{ color: 'var(--text-muted)', fontSize: 12 }}>Davomiyligi</dt>
              <dd style={{ margin: '2px 0 12px' }}>{formatDuration(call.durationSeconds)}</dd>
              <dt style={{ color: 'var(--text-muted)', fontSize: 12 }}>Yo'nalish</dt>
              <dd style={{ margin: '2px 0' }}>{DIRECTION_LABELS[call.direction]}</dd>
            </dl>
          </div>
          <div>
            {call.recordingUrl ? (
              <audio controls style={{ width: '100%' }} src={call.recordingUrl} />
            ) : (
              <div className="empty-state">Audio yozuv mavjud emas.</div>
            )}

            <div style={{ marginTop: 16 }}>
              {call.analysisStatus === 'NOT_ANALYZED' && (
                <button className="analyze-btn" onClick={handleAnalyze} disabled={analyzing || !call.recordingUrl}>
                  Tahlil qilish
                </button>
              )}
              {call.analysisStatus === 'PROCESSING' && <span className="status-pill">Tahlil qilinmoqda...</span>}
              {call.analysisStatus === 'COMPLETED' && (
                <span className="status-pill" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                  Tahlil tayyor
                </span>
              )}
              {call.analysisStatus === 'FAILED' && (
                <div>
                  <div className="error-text">Tahlilda xatolik yuz berdi.</div>
                  <button className="analyze-btn" onClick={handleAnalyze} disabled={analyzing}>
                    Qayta urinish
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {analysis && (
        <>
          <div className="panel">
            <h3>Transkript</h3>
            {analysis.transcript.length === 0 && <div className="empty-state">Transkript mavjud emas.</div>}
            {analysis.transcript.map((line, i) => (
              <div className="transcript-line" key={i}>
                <span>{line.timestamp}</span>
                <span className={`speaker ${line.speaker === 'Sotuvchi' ? 'sotuvchi' : 'mijoz'}`}>{line.speaker}</span>
                <span>{line.text}</span>
              </div>
            ))}
          </div>

          <div className="panel">
            <h3>AI tahlil</h3>
            <div style={{ fontSize: 32, fontWeight: 700, color: scoreColor(analysis.overallScore), marginBottom: 16 }}>
              {analysis.overallScore} / 100
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{analysis.summary}</p>

            {Object.entries(SKILL_LABELS).map(([key, label]) => (
              <div className="bar-row" key={key}>
                <span className="bar-label">{label}</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${analysis[key]}%` }} />
                </div>
                <span className="bar-value">{analysis[key]}</span>
              </div>
            ))}
          </div>

          <div className="panel">
            <h3>Kuchli tomonlar</h3>
            {analysis.strengths.length === 0 && <div className="empty-state">Aniqlangan kuchli tomonlar yo'q.</div>}
            <ul>
              {analysis.strengths.map((s, i) => (
                <li key={i} style={{ marginBottom: 6, fontSize: 14 }}>{s}</li>
              ))}
            </ul>
          </div>

          <div className="panel">
            <h3>Aniqlangan xatolar</h3>
            {analysis.mistakes.length === 0 && <div className="empty-state">Xatolar aniqlanmadi.</div>}
            {analysis.mistakes.map((m) => (
              <div className="mistake-card" key={m.id}>
                <div className="mistake-header">
                  <strong>{m.category}</strong>
                  <span className="severity-badge" style={{ background: SEVERITY_COLORS[m.severity] }}>
                    {SEVERITY_LABELS[m.severity] || m.severity}
                  </span>
                </div>
                <dl>
                  <dt>Nima bo'ldi</dt>
                  <dd>{m.description}</dd>
                  <dt>Dalil</dt>
                  <dd>{m.evidence}</dd>
                  <dt>Nega noto'g'ri</dt>
                  <dd>{m.whyItIsWrong}</dd>
                  <dt>Qanday tuzatish kerak</dt>
                  <dd>{m.recommendation}</dd>
                  <dt>To'g'ri variant</dt>
                  <dd>{m.betterPhrase}</dd>
                </dl>
              </div>
            ))}
          </div>

          <div className="panel">
            <h3>Tavsiyalar</h3>
            {analysis.recommendations.length === 0 && <div className="empty-state">Tavsiyalar yo'q.</div>}
            {analysis.recommendations.map((r) => (
              <div className="mistake-card" key={r.id}>
                <dl>
                  <dt>Muammo</dt>
                  <dd>{r.problem}</dd>
                  <dt>Nima qilish kerak</dt>
                  <dd>{r.whatToDo}</dd>
                  <dt>To'g'ri ibora</dt>
                  <dd>"{r.betterPhrase}"</dd>
                </dl>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
