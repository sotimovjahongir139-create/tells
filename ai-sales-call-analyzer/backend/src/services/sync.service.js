const axios = require('axios');
const prisma = require('../lib/prisma');
const env = require('../config/env');
const amocrm = require('./amocrm.service');

// amoCRM's /notes list endpoints don't reliably honor filter[created_at][from]
// (confirmed empirically against this account), so we cannot ask amoCRM to
// only hand us "new since X" notes by date. Instead we page through notes
// (ordered desc by created_at, which does correlate with note id in practice)
// and stop as soon as we reach a page made up entirely of note ids we've
// already processed before — tracked per entity type in SyncState. This keeps
// steady-state syncs cheap (1-2 requests) instead of rescanning full history
// every run.
const MAX_PAGES_PER_RUN = 8;

const client = axios.create({
  baseURL: `https://${env.amocrmDomain}/api/v4`,
  headers: { Authorization: `Bearer ${env.amocrmAccessToken}` },
  timeout: 20000,
});

async function fetchEntityName(entityType, entityId) {
  try {
    const res = await client.get(`/${entityType}/${entityId}`);
    return res.data?.name || null;
  } catch {
    return null;
  }
}

// A note is only trusted as Asadbek's call when amoCRM itself attributes it to
// his user id, either as the note author or as the responsible user on the
// lead/contact the note is attached to. Notes created by the integration
// (created_by: 0) with no matching responsible_user_id are skipped rather than
// guessed at.
function belongsToSalesperson(note, amocrmUserId) {
  const createdBy = String(note.created_by);
  const responsibleId = String(note.responsible_user_id);
  return createdBy === String(amocrmUserId) || responsibleId === String(amocrmUserId);
}

async function upsertCallFromNote(note, entityType, salespersonId) {
  const amocrmCallId = `${entityType}:${note.id}`;
  const params = note.params || {};

  // Cheap local check first — avoids an amoCRM round trip (fetchEntityName)
  // for notes we've already synced, which matters when a re-crawl revisits
  // hundreds of already-known notes (e.g. the id cursor was just introduced).
  const existing = await prisma.call.findUnique({ where: { amocrmCallId } });
  if (existing) return { created: false };

  const customerName = await fetchEntityName(entityType, note.entity_id);

  try {
    await prisma.call.create({
      data: {
        amocrmCallId,
        salespersonId,
        customerName,
        customerPhone: params.phone || null,
        direction: note.note_type === 'call_in' ? 'IN' : 'OUT',
        startedAt: new Date(note.created_at * 1000),
        durationSeconds: params.duration || 0,
        recordingUrl: params.link || null,
        analysisStatus: 'NOT_ANALYZED',
      },
    });
  } catch (err) {
    // amoCRM's live pagination can shift mid-crawl and hand us the same note
    // twice in one run; a unique-constraint hit here just means another
    // iteration already inserted it first.
    if (err.code !== 'P2002') throw err;
  }
  return { created: true };
}

async function syncEntityType(entityType, salesperson) {
  const stateKey = `notes:${entityType}`;
  const state = await prisma.syncState.upsert({
    where: { key: stateKey },
    update: {},
    create: { key: stateKey, lastNoteId: 0 },
  });

  let fetched = 0;
  let created = 0;
  let skippedUnattributed = 0;
  let highestNoteIdSeen = state.lastNoteId;

  for (let page = 1; page <= MAX_PAGES_PER_RUN; page += 1) {
    const notes = await amocrm.fetchCallNotes({ entityType, page });
    if (notes.length === 0) break;

    const newNotes = notes.filter((n) => n.id > state.lastNoteId);

    for (const note of newNotes) {
      fetched += 1;
      if (note.id > highestNoteIdSeen) highestNoteIdSeen = note.id;

      if (!belongsToSalesperson(note, salesperson.amocrmUserId)) {
        skippedUnattributed += 1;
        continue;
      }
      const result = await upsertCallFromNote(note, entityType, salesperson.id);
      if (result.created) created += 1;
    }

    // Reached previously-synced territory (partial or empty overlap), or
    // this was the last page of data available either way.
    if (newNotes.length < notes.length || notes.length < 250) break;
  }

  if (highestNoteIdSeen > state.lastNoteId) {
    await prisma.syncState.update({
      where: { key: stateKey },
      data: { lastNoteId: highestNoteIdSeen },
    });
  }

  return { fetched, created, skippedUnattributed };
}

async function syncAmoCrmCalls() {
  if (!env.amocrmAccessToken || !env.amocrmDomain) {
    throw new Error('amoCRM ulanish sozlanmagan (AMOCRM_DOMAIN / AMOCRM_ACCESS_TOKEN).');
  }

  const salesperson = await prisma.salesperson.findUnique({
    where: { amocrmUserId: env.asadbekAmocrmUserId },
  });
  if (!salesperson) {
    throw new Error('Sotuvchi (Asadbek) bazada topilmadi. Avval seed skriptini ishga tushiring.');
  }

  const totals = { fetched: 0, created: 0, skippedUnattributed: 0 };
  for (const entityType of ['leads', 'contacts']) {
    const result = await syncEntityType(entityType, salesperson);
    totals.fetched += result.fetched;
    totals.created += result.created;
    totals.skippedUnattributed += result.skippedUnattributed;
  }

  return totals;
}

module.exports = { syncAmoCrmCalls };
