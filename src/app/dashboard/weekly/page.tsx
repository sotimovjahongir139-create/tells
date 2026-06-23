import { prisma } from '@/lib/prisma';
import StatCard from '@/components/StatCard';
import HourChart from '@/components/HourChart';
import RateGauge from '@/components/RateGauge';
import SyncStatus from '@/components/SyncStatus';
import PeriodTabs from '@/components/PeriodTabs';

export const revalidate = 0;

async function getData() {
  const [stats, lastSync] = await Promise.all([
    prisma.amoCallWeeklyStat.findMany({
      orderBy: { weekStart: 'desc' },
      take: 1,
    }),
    prisma.amoSyncLog.findFirst({ orderBy: { syncedAt: 'desc' } }),
  ]);
  return { stat: stats[0] ?? null, lastSync };
}

function fmtDate(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toLocaleDateString('uz-Latn-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function weekEnd(start: Date | string): string {
  const dt = typeof start === 'string' ? new Date(start) : new Date(start);
  dt.setDate(dt.getDate() + 5); // Mon–Sat
  return fmtDate(dt);
}

export default async function WeeklyPage() {
  const { stat: s, lastSync } = await getData();

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 md:p-8 space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Haftalik Statistika</h1>
          {s && (
            <p className="text-sm text-gray-400 mt-1">
              {fmtDate(s.weekStart)} – {weekEnd(s.weekStart)} · {s.managerName}
            </p>
          )}
        </div>
        <SyncStatus lastSync={lastSync} />
      </div>

      <PeriodTabs />

      {!s ? (
        <div className="flex items-center justify-center h-64 text-gray-500">
          Haftalik ma'lumot mavjud emas.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Jami qo'ng'iroqlar" value={s.totalCalls} color="blue" />
            <StatCard label="Kiruvchi (javob)" value={s.incomingAnswered} color="green" />
            <StatCard label="Chiquvchi (javob)" value={s.outgoingAnswered} color="green" />
            <StatCard label="O'rtacha qayta aloqa" value={s.avgRecallMinutes} unit="daq" color="default" />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <RateGauge label="Javob berish foizi" value={s.answerRate} />
            <RateGauge label="Qayta chiqish foizi" value={s.recallRate} />
            <StatCard label="O'tkazib yuborilgan" value={s.missedClients} color="red" />
            <StatCard label="Qayta chiqilmagan" value={s.notRecalledClients} color="red" />
          </div>

          <HourChart
            title="Hafta bo'yicha soatlik taqsimot"
            data={{
              '09:00-11:00': s.h0911,
              '11:00-13:00': s.h1113,
              '13:00-15:00': s.h1315,
              '15:00-17:00': s.h1517,
              '17:00-19:00': s.h1719,
              '19:00-21:00': s.h1921,
              '21:00-23:00': s.h2123,
            }}
          />
        </>
      )}
    </div>
  );
}
