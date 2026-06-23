'use client';
import { useState } from 'react';

interface LastSync {
  syncedAt: Date | string;
  status: string;
  manager?: string | null;
  eventsCount?: number | null;
  durationMs?: number | null;
  errorMsg?: string | null;
}

interface SyncStatusProps {
  lastSync: LastSync | null;
}

function fmtDate(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toLocaleString('uz-Latn-UZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SyncStatus({ lastSync }: SyncStatusProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleSync() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'x-sync-source': 'ui' },
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ ok: true, text: `Muvaffaqiyatli: ${data.eventsCount ?? 0} ta event` });
      } else {
        setMessage({ ok: false, text: `Xato: ${data.error ?? 'noma\'lum'}` });
      }
    } catch {
      setMessage({ ok: false, text: 'Ulanish xatosi' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2 text-right">
      {lastSync && (
        <div className="text-xs text-gray-400 space-y-0.5">
          <div>
            Sinxronizatsiya:{' '}
            <span className="text-gray-300">{fmtDate(lastSync.syncedAt)}</span>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                lastSync.status === 'success'
                  ? 'bg-green-900 text-green-400'
                  : 'bg-red-900 text-red-400'
              }`}
            >
              {lastSync.status === 'success' ? 'Muvaffaqiyatli' : 'Xato'}
            </span>
            {lastSync.eventsCount != null && (
              <span>{lastSync.eventsCount} event</span>
            )}
            {lastSync.durationMs != null && (
              <span>{(lastSync.durationMs / 1000).toFixed(1)}s</span>
            )}
          </div>
          {lastSync.errorMsg && (
            <div className="text-red-400 text-xs">{lastSync.errorMsg}</div>
          )}
        </div>
      )}

      {message && (
        <p className={`text-xs ${message.ok ? 'text-green-400' : 'text-red-400'}`}>
          {message.text}
        </p>
      )}

      <button
        onClick={handleSync}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-900 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
      >
        {loading ? 'Sinxronlanmoqda...' : 'Sinxronizatsiya'}
      </button>
    </div>
  );
}
