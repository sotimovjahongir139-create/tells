const BASE_URL = () => `https://${process.env.AMOCRM_DOMAIN}`;
const AUTH_HEADER = () => ({ Authorization: `Bearer ${process.env.AMOCRM_TOKEN}` });

async function safeGet(url: string, params?: Record<string, string | number>): Promise<Response> {
  const qs = params
    ? '?' + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()
    : '';

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url + qs, {
        headers: AUTH_HEADER(),
        signal: AbortSignal.timeout(60_000),
        next: { revalidate: 0 },
      });
      return res;
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 5_000 * attempt));
    }
  }
  throw new Error('safeGet: all retries failed');
}

export async function getTargetUserIds(names: string[]): Promise<Record<number, string>> {
  const res = await safeGet(`${BASE_URL()}/api/v4/users`);
  if (res.status === 401) throw new Error('AmoCRM 401: token invalid or expired');
  if (!res.ok) throw new Error(`AmoCRM users error: ${res.status}`);

  const data = await res.json();
  const result: Record<number, string> = {};

  for (const u of data._embedded?.users ?? []) {
    const fullName: string = u.name ?? '';
    for (const name of names) {
      if (fullName.toLowerCase().includes(name.toLowerCase())) {
        result[u.id as number] = fullName;
      }
    }
  }
  return result;
}

export interface AmoEvent {
  id: number;
  type: string;
  entity_id: number;
  created_by: number;
  created_at: number;
  value_after?: Array<{ note?: { id: number } }>;
}

export async function fetchCallEvents(
  userIds: number[],
  fromTs: number,
  toTs: number,
): Promise<AmoEvent[]> {
  const all: AmoEvent[] = [];

  for (const etype of ['incoming_call', 'outgoing_call']) {
    let page = 1;
    while (true) {
      const params: Record<string, string | number> = {
        'filter[created_at][from]': fromTs,
        'filter[created_at][to]': toTs,
        'filter[type]': etype,
        limit: 100,
        page,
      };

      const res = await safeGet(`${BASE_URL()}/api/v4/events`, params);
      if (res.status === 204 || res.status === 404) break;
      if (!res.ok) break;

      const data = await res.json();
      const items: AmoEvent[] = data._embedded?.events ?? [];
      if (!items.length) break;

      const filtered = items.filter((e) => userIds.includes(e.created_by));
      all.push(...filtered);

      if (!data._links?.next) break;
      page++;
    }
  }

  return all;
}

export interface NoteParams {
  duration?: number;
  direction?: string;
}

export async function fetchNotes(
  noteIds: number[],
): Promise<Record<number, NoteParams>> {
  const notes: Record<number, NoteParams> = {};
  const unique = [...new Set(noteIds)];

  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50);
    const params: Record<string, string | number> = { limit: 50 };
    batch.forEach((id, j) => { params[`filter[id][${j}]`] = id; });

    for (const entity of ['contacts', 'leads']) {
      const res = await safeGet(`${BASE_URL()}/api/v4/${entity}/notes`, params);
      if (res.ok && res.status !== 204) {
        const data = await res.json();
        let found = false;
        for (const note of data._embedded?.notes ?? []) {
          if (note.id && batch.includes(note.id)) {
            notes[note.id as number] = note.params ?? {};
            found = true;
          }
        }
        if (found) break;
      }
    }
  }

  return notes;
}
