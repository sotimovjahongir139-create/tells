const { DateTime } = require('luxon');
const prisma = require('../lib/prisma');
const dateRange = require('../lib/dateRange');

const WEEKDAY_LABELS_UZ = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba'];
const CALLS_LIST_LIMIT = 100;

function average(values) {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round(sum / values.length);
}

function summarize(calls) {
  const analyzed = calls.filter((c) => c.analysis);
  const totalCalls = calls.length;
  const analyzedCalls = analyzed.length;
  const avgScore = average(analyzed.map((c) => c.analysis.overallScore));
  const avgDurationSeconds = average(calls.map((c) => c.durationSeconds));

  const skills = {
    communication: average(analyzed.map((c) => c.analysis.communication)),
    needDiscovery: average(analyzed.map((c) => c.analysis.needDiscovery)),
    productPresentation: average(analyzed.map((c) => c.analysis.productPresentation)),
    objectionHandling: average(analyzed.map((c) => c.analysis.objectionHandling)),
    closing: average(analyzed.map((c) => c.analysis.closing)),
  };

  const mistakeCounts = {};
  for (const call of analyzed) {
    for (const mistake of call.analysis.mistakes) {
      mistakeCounts[mistake.category] = (mistakeCounts[mistake.category] || 0) + 1;
    }
  }
  const topMistakes = Object.entries(mistakeCounts)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return { totalCalls, analyzedCalls, avgScore, avgDurationSeconds, skills, topMistakes };
}

function callToListItem(call) {
  return {
    id: call.id,
    startedAt: call.startedAt,
    customerName: call.customerName,
    customerPhone: call.customerPhone,
    direction: call.direction,
    durationSeconds: call.durationSeconds,
    analysisStatus: call.analysisStatus,
    overallScore: call.analysis?.overallScore ?? null,
  };
}

function buildWeeklyBreakdown(calls, weekStart) {
  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const dayStart = weekStart.plus({ days: i }).startOf('day');
    const dayEnd = dayStart.endOf('day');
    const dayCalls = calls.filter((c) => {
      const t = DateTime.fromJSDate(c.startedAt).setZone(dateRange.ZONE);
      return t >= dayStart && t <= dayEnd;
    });
    const stats = summarize(dayCalls);
    days.push({
      date: dayStart.toISODate(),
      label: WEEKDAY_LABELS_UZ[i],
      totalCalls: stats.totalCalls,
      avgScore: stats.avgScore,
    });
  }
  return days;
}

function buildMonthlyBreakdown(calls, monthStart, monthEnd) {
  const days = [];
  let cursor = monthStart.startOf('day');
  while (cursor <= monthEnd) {
    const dayStart = cursor;
    const dayEnd = cursor.endOf('day');
    const dayCalls = calls.filter((c) => {
      const t = DateTime.fromJSDate(c.startedAt).setZone(dateRange.ZONE);
      return t >= dayStart && t <= dayEnd;
    });
    const stats = summarize(dayCalls);
    days.push({
      date: dayStart.toISODate(),
      label: `${dayStart.day}-kun`,
      totalCalls: stats.totalCalls,
      avgScore: stats.avgScore,
    });
    cursor = cursor.plus({ days: 1 });
  }
  return days;
}

async function getDashboard(period, dateStr) {
  const range = dateRange.getRange(period, dateStr);

  const calls = await prisma.call.findMany({
    where: {
      startedAt: {
        gte: dateRange.toZonedJSDate(range.start),
        lte: dateRange.toZonedJSDate(range.end),
      },
    },
    include: { analysis: { include: { mistakes: true } } },
    orderBy: { startedAt: 'asc' },
  });

  const stats = summarize(calls);

  let breakdown = null;
  if (period === 'weekly') {
    breakdown = buildWeeklyBreakdown(calls, range.start);
  } else if (period === 'monthly') {
    breakdown = buildMonthlyBreakdown(calls, range.start, range.end);
  }

  return {
    period,
    range: {
      start: range.start.toISODate(),
      end: range.end.toISODate(),
      label: range.label,
    },
    selectedDate: dateRange.parseSelectedDate(dateStr).toISODate(),
    prevDate: dateRange.shift(period, dateStr, 'prev'),
    nextDate: dateRange.shift(period, dateStr, 'next'),
    totals: {
      totalCalls: stats.totalCalls,
      analyzedCalls: stats.analyzedCalls,
      avgScore: stats.avgScore,
      avgDurationSeconds: stats.avgDurationSeconds,
    },
    skills: stats.skills,
    topMistakes: stats.topMistakes,
    breakdown,
    calls: calls.slice(-CALLS_LIST_LIMIT).reverse().map(callToListItem),
    callsShown: Math.min(calls.length, CALLS_LIST_LIMIT),
    callsTotal: calls.length,
  };
}

module.exports = { getDashboard };
