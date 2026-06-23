import type { AmoEvent, NoteParams } from './amo-client';

const TZ_OFFSET_HOURS = 5; // UTC+5 Tashkent

const HOUR_SLOTS: [string, number, number][] = [
  ['09:00-11:00', 9, 11],
  ['11:00-13:00', 11, 13],
  ['13:00-15:00', 13, 15],
  ['15:00-17:00', 15, 17],
  ['17:00-19:00', 17, 19],
  ['19:00-21:00', 19, 21],
  ['21:00-23:00', 21, 23],
];

export interface CallRecord {
  direction: 'inbound' | 'outbound' | string;
  duration: number;
  contactId: number;
  createdAt: number;
}

export interface CalcResult {
  total: number;
  incoming: number;
  outgoing: number;
  missed: number;
  recalled: number;
  notRecalled: number;
  answerRate: number;
  recallRate: number;
  noRecallPct: number;
  avgRecallMinutes: number;
  hours: Record<string, number>;
}

export function buildRecords(
  events: AmoEvent[],
  notes: Record<number, NoteParams>,
): CallRecord[] {
  const sorted = [...events].sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0));
  const records: CallRecord[] = [];

  for (const e of sorted) {
    const contactId = e.entity_id;
    if (!contactId) continue;

    let noteId: number | null = null;
    for (const va of e.value_after ?? []) {
      if (va.note?.id) { noteId = va.note.id; break; }
    }

    const p: NoteParams = noteId ? (notes[noteId] ?? {}) : {};
    const duration = p.duration ?? -1;
    const direction = p.direction
      ? p.direction
      : e.type === 'incoming_call' ? 'inbound' : 'outbound';

    records.push({ direction, duration, contactId, createdAt: e.created_at ?? 0 });
  }

  return records;
}

export function filterRecords(
  records: CallRecord[],
  fromTs: number,
  toTs: number,
): CallRecord[] {
  return records.filter((r) => r.createdAt >= fromTs && r.createdAt <= toTs);
}

function slotFor(unixTs: number): string | null {
  const tzHour = new Date((unixTs + TZ_OFFSET_HOURS * 3600) * 1000).getUTCHours();
  for (const [label, sh, eh] of HOUR_SLOTS) {
    if (tzHour >= sh && tzHour < eh) return label;
  }
  return null;
}

export function calcStats(records: CallRecord[]): CalcResult {
  const hours: Record<string, number> = Object.fromEntries(
    HOUR_SLOTS.map(([label]) => [label, 0]),
  );

  const missedFirstTime: Record<number, number> = {};
  const missed = new Set<number>();
  const recalled = new Set<number>();
  const recallGapsMins: number[] = [];
  let inA = 0;
  let outA = 0;

  const sorted = [...records].sort((a, b) => a.createdAt - b.createdAt);

  for (const { contactId: cid, direction: d, duration: dur, createdAt: ts } of sorted) {
    const slot = slotFor(ts);

    if (d === 'inbound') {
      if (dur <= 0) {
        missed.add(cid);
        recalled.delete(cid);
        if (!(cid in missedFirstTime)) missedFirstTime[cid] = ts;
        if (slot) hours[slot]++;
      } else {
        if (missed.has(cid)) {
          missed.delete(cid);
          delete missedFirstTime[cid];
        }
        inA++;
        if (slot) hours[slot]++;
      }
    } else if (d === 'outbound') {
      if (dur > 0) {
        outA++;
        if (slot) hours[slot]++;
        if (missed.has(cid)) {
          recalled.add(cid);
          missed.delete(cid);
          if (cid in missedFirstTime) {
            recallGapsMins.push((ts - missedFirstTime[cid]) / 60);
            delete missedFirstTime[cid];
          }
        }
      }
    }
  }

  const totalMissed = missed.size + recalled.size;
  const rc = recalled.size;
  const nrc = missed.size;
  const total = inA + outA + totalMissed;
  const answerRate = total ? Math.round(((inA + outA) / total) * 100) : 0;
  const recallRate = totalMissed ? Math.round((rc / totalMissed) * 100) : 0;
  const noRecallPct = totalMissed ? Math.round((nrc / totalMissed) * 100) : 0;
  const avgRecallMinutes = recallGapsMins.length
    ? Math.round((recallGapsMins.reduce((a, b) => a + b, 0) / recallGapsMins.length) * 10) / 10
    : 0;

  return {
    total,
    incoming: inA,
    outgoing: outA,
    missed: totalMissed,
    recalled: rc,
    notRecalled: nrc,
    answerRate,
    recallRate,
    noRecallPct,
    avgRecallMinutes,
    hours,
  };
}
