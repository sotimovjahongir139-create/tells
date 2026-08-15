import { useState } from 'react';
import api from '../api/client';

export default function Settings() {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function handleSync() {
    setSyncing(true);
    setError('');
    setResult(null);
    try {
      const res = await api.post('/sync/amocrm');
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Sinxronlashda xatolik yuz berdi.');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div>
      <div className="panel">
        <h3>amoCRM sinxronizatsiyasi</h3>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
          Tizim amoCRM'dan Asadbekning qo'ng'iroqlarini avtomatik ravishda muntazam sinxronlaydi.
          Zarur bo'lsa, qo'lda ham ishga tushirishingiz mumkin.
        </p>
        <button className="analyze-btn" onClick={handleSync} disabled={syncing}>
          {syncing ? 'Sinxronlanmoqda...' : 'Hozir sinxronlash'}
        </button>
        {result && (
          <p style={{ marginTop: 12, fontSize: 13, color: 'var(--text-secondary)' }}>
            Tekshirildi: {result.fetched}, yangi qo'shildi: {result.created}
          </p>
        )}
        {error && <div className="error-text">{error}</div>}
      </div>

      <div className="panel">
        <h3>Sotuvchi</h3>
        <p style={{ fontSize: 14 }}>Asadbek</p>
      </div>
    </div>
  );
}
