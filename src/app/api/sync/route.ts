import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTargetUserIds, fetchCallEvents, fetchNotes } from '@/lib/amo-client';
import { buildRecords, filterRecords, calcStats } from '@/lib/call-stats';
import { revalidatePath } from 'next/cache';

function getManagers(): string[] {
  return (process.env.TARGET_MANAGERS ?? 'Asadbek')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.SYNC_SECRET;
  if (!secret) return true; // no secret configured → open
  const isUi = req.headers.get('x-sync-source') === 'ui';
  if (isUi) return true;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

function dateRange(base: Date, offsetDays: number): [Date, Date] {
  const start = new Date(base);
  start.setDate(start.getDate() + offsetDays);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return [start, end];
}

function weekStartFor(d: Date): Date {
  const day = d.getDay(); // 0=Sun, 1=Mon
  const diff = day === 0 ? -6 : 1 - day;
  const ws = new Date(d);
  ws.setDate(d.getDate() + diff);
  ws.setHours(0, 0, 0, 0);
  return ws;
}

function monthStartFor(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

const hourFields = (h: Record<string, number>) => ({
  h0911: h['09:00-11:00'] ?? 0,
  h1113: h['11:00-13:00'] ?? 0,
  h1315: h['13:00-15:00'] ?? 0,
  h1517: h['15:00-17:00'] ?? 0,
  h1719: h['17:00-19:00'] ?? 0,
  h1921: h['19:00-21:00'] ?? 0,
  h2123: h['21:00-23:00'] ?? 0,
});

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    const managerNames = getManagers();
    const targetIds = await getTargetUserIds(managerNames);

    if (Object.keys(targetIds).length === 0) {
      throw new Error(`No managers found matching: ${managerNames.join(', ')}`);
    }

    const now = new Date();
    let yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (yesterday.getDay() === 0) yesterday.setDate(yesterday.getDate() - 1); // skip Sunday

    const [dayStart, dayEnd] = dateRange(yesterday, 0);
    const weekStart = weekStartFor(dayStart);
    const monthStart = monthStartFor(dayStart);

    const fetchFrom = Math.min(weekStart.getTime(), monthStart.getTime());
    const fetchFromTs = Math.floor(fetchFrom / 1000);
    const fetchToTs = Math.floor(dayEnd.getTime() / 1000);

    const userIds = Object.keys(targetIds).map(Number);
    const events = await fetchCallEvents(userIds, fetchFromTs, fetchToTs);

    const noteIds: number[] = [];
    for (const e of events) {
      for (const va of e.value_after ?? []) {
        if (va.note?.id) noteIds.push(va.note.id);
      }
    }

    const notes = await fetchNotes(noteIds);
    const allRecords = buildRecords(events, notes);

    const ts = (d: Date) => Math.floor(d.getTime() / 1000);

    for (const [managerId, managerName] of Object.entries(targetIds)) {
      const manId = Number(managerId);
      const managerEvents = events.filter((e) => e.created_by === manId);
      const managerRecords = buildRecords(managerEvents, notes);

      const dStats = calcStats(filterRecords(managerRecords, ts(dayStart), ts(dayEnd)));
      const wStats = calcStats(filterRecords(managerRecords, ts(weekStart), ts(dayEnd)));
      const mStats = calcStats(filterRecords(managerRecords, ts(monthStart), ts(dayEnd)));

      const baseData = (stat: typeof dStats) => ({
        totalCalls: stat.total,
        incomingAnswered: stat.incoming,
        outgoingAnswered: stat.outgoing,
        missedClients: stat.missed,
        recalledClients: stat.recalled,
        notRecalledClients: stat.notRecalled,
        answerRate: stat.answerRate,
        recallRate: stat.recallRate,
        noRecallPct: stat.noRecallPct,
        avgRecallMinutes: stat.avgRecallMinutes,
        ...hourFields(stat.hours),
      });

      await prisma.amoCallDailyStat.upsert({
        where: { statDate_managerName: { statDate: dayStart, managerName } },
        create: { statDate: dayStart, managerName, ...baseData(dStats) },
        update: baseData(dStats),
      });

      await prisma.amoCallWeeklyStat.upsert({
        where: { weekStart_managerName: { weekStart, managerName } },
        create: { weekStart, managerName, ...baseData(wStats) },
        update: baseData(wStats),
      });

      await prisma.amoCallMonthlyStat.upsert({
        where: { monthStart_managerName: { monthStart, managerName } },
        create: { monthStart, managerName, ...baseData(mStats) },
        update: baseData(mStats),
      });
    }

    const durationMs = Date.now() - startTime;
    const firstManager = Object.values(targetIds)[0];

    await prisma.amoSyncLog.create({
      data: {
        status: 'success',
        manager: firstManager,
        eventsCount: events.length,
        durationMs,
      },
    });

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/weekly');
    revalidatePath('/dashboard/monthly');

    return NextResponse.json({
      status: 'ok',
      managers: Object.values(targetIds),
      eventsCount: events.length,
      durationMs,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - startTime;

    await prisma.amoSyncLog.create({
      data: { status: 'error', errorMsg: msg, durationMs },
    }).catch(() => null);

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  const last = await prisma.amoSyncLog.findFirst({
    orderBy: { syncedAt: 'desc' },
  });
  return NextResponse.json(last);
}
