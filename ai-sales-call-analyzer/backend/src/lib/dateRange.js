const { DateTime } = require('luxon');
const env = require('../config/env');

const ZONE = env.timezone;

function parseSelectedDate(dateStr) {
  if (dateStr) {
    const parsed = DateTime.fromISO(dateStr, { zone: ZONE });
    if (parsed.isValid) return parsed.startOf('day');
  }
  return DateTime.now().setZone(ZONE).startOf('day');
}

function dailyRange(dateStr) {
  const day = parseSelectedDate(dateStr);
  return {
    start: day.startOf('day'),
    end: day.endOf('day'),
    label: day.toFormat('d MMMM yyyy'),
  };
}

function weeklyRange(dateStr) {
  const day = parseSelectedDate(dateStr);
  const monday = day.startOf('week'); // luxon weeks start Monday by default (ISO)
  const sunday = monday.endOf('week');
  return {
    start: monday.startOf('day'),
    end: sunday.endOf('day'),
    label: `${monday.toFormat('d MMM')} – ${sunday.toFormat('d MMM yyyy')}`,
  };
}

function monthlyRange(dateStr) {
  const day = parseSelectedDate(dateStr);
  const first = day.startOf('month');
  const last = day.endOf('month');
  return {
    start: first.startOf('day'),
    end: last.endOf('day'),
    label: first.toFormat('MMMM yyyy'),
  };
}

function getRange(period, dateStr) {
  switch (period) {
    case 'daily':
      return dailyRange(dateStr);
    case 'weekly':
      return weeklyRange(dateStr);
    case 'monthly':
      return monthlyRange(dateStr);
    default:
      throw new Error(`Unknown period: ${period}`);
  }
}

function shift(period, dateStr, direction) {
  const day = parseSelectedDate(dateStr);
  const amount = direction === 'next' ? 1 : -1;
  let shifted;
  if (period === 'daily') shifted = day.plus({ days: amount });
  else if (period === 'weekly') shifted = day.plus({ weeks: amount });
  else if (period === 'monthly') shifted = day.plus({ months: amount });
  else throw new Error(`Unknown period: ${period}`);
  return shifted.toISODate();
}

function toZonedJSDate(dt) {
  return dt.toJSDate();
}

module.exports = {
  ZONE,
  parseSelectedDate,
  dailyRange,
  weeklyRange,
  monthlyRange,
  getRange,
  shift,
  toZonedJSDate,
};
