import os
import sys
import time
import requests
from dotenv import load_dotenv

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

try:
    import psycopg2
    _HAS_PG = True
except ImportError:
    _HAS_PG = False
from datetime import datetime, timedelta, timezone

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env.local'))
load_dotenv()  # fallback: .env

AMOCRM_DOMAIN   = os.getenv("AMOCRM_DOMAIN")
AMOCRM_TOKEN    = os.getenv("AMOCRM_TOKEN")
TARGET_MANAGERS = [m.strip() for m in os.getenv("TARGET_MANAGERS", "Asadbek").split(",")]
DATABASE_URL     = os.getenv("DATABASE_URL")

# Build DATABASE_URL from parts if not set
if not DATABASE_URL:
    db_host = os.getenv("DB_SERVER", "localhost")
    db_name = os.getenv("DB_NAME", "tells")
    db_user = os.getenv("DB_USER", "")
    db_pass = os.getenv("DB_PASSWORD", "")
    db_port = os.getenv("DB_PORT", "5432")
    if db_user and db_pass:
        DATABASE_URL = f"postgresql://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}"
    elif db_user:
        DATABASE_URL = f"postgresql://{db_user}@{db_host}:{db_port}/{db_name}"
    else:
        DATABASE_URL = f"postgresql://{db_host}:{db_port}/{db_name}"

if not AMOCRM_DOMAIN or not AMOCRM_TOKEN:
    print("XATO: AMOCRM_DOMAIN yoki AMOCRM_TOKEN topilmadi.")
    sys.exit(1)

TZ = timezone(timedelta(hours=5))

def to_ts(dt):
    return int(dt.replace(tzinfo=TZ).timestamp())

def from_ts(ts):
    return datetime.fromtimestamp(ts, tz=TZ).replace(tzinfo=None)

# ── Sana logikasi ──
now    = datetime.now()
_kecha = now - timedelta(days=1)
if _kecha.weekday() == 6:
    yesterday = now - timedelta(days=2)
    print(f"[!] Kecha yakshanba edi — {yesterday.strftime('%d.%m.%Y')} (shanba) olinadi.")
else:
    yesterday = _kecha

DAY_START   = yesterday.replace(hour=0,  minute=0,  second=0,  microsecond=0)
DAY_END     = yesterday.replace(hour=23, minute=59, second=59, microsecond=0)
MONTH_START = DAY_START.replace(day=1)
MONTH_END   = DAY_END
week_day    = yesterday.weekday()
WEEK_START  = (yesterday - timedelta(days=week_day)).replace(
    hour=0, minute=0, second=0, microsecond=0)
WEEK_END    = DAY_END

STAT_DATE  = yesterday.date()
STAT_MONTH = MONTH_START.date()
STAT_WEEK  = WEEK_START.date()

BASE_URL    = f"https://{AMOCRM_DOMAIN}"
HEADERS     = {"Authorization": f"Bearer {AMOCRM_TOKEN}"}
TIMEOUT     = 60
RETRIES     = 3
RETRY_DELAY = 5

HOUR_SLOTS = [
    ("09:00-11:00", 9,  11),
    ("11:00-13:00", 11, 13),
    ("13:00-15:00", 13, 15),
    ("15:00-17:00", 15, 17),
    ("17:00-19:00", 17, 19),
    ("19:00-21:00", 19, 21),
    ("21:00-23:00", 21, 23),
]


# ══════════════════════════════════════════════════════════════
# API
# ══════════════════════════════════════════════════════════════
def safe_get(url, params=None):
    for attempt in range(1, RETRIES + 1):
        try:
            r = requests.get(url, headers=HEADERS, params=params, timeout=TIMEOUT)
            return r
        except (requests.exceptions.ReadTimeout,
                requests.exceptions.ConnectionError) as e:
            print(f"   Ulanish xatosi ({attempt}/{RETRIES}): {e}")
            if attempt < RETRIES:
                time.sleep(RETRY_DELAY)
    raise Exception("Barcha urinishlar muvaffaqiyatsiz!")


def get_target_ids():
    r = safe_get(f"{BASE_URL}/api/v4/users")
    if r.status_code == 401:
        print("XATO: Token noto'g'ri.")
        sys.exit(1)
    ids = {}
    for u in r.json().get("_embedded", {}).get("users", []):
        name = u.get("name", "")
        for t in TARGET_MANAGERS:
            if t.lower() in name.lower():
                ids[u["id"]] = name
    return ids


def fetch_events(target_ids, start_dt, end_dt):
    events = []
    for etype in ["incoming_call", "outgoing_call"]:
        page = 1
        while True:
            params = {
                "filter[created_at][from]": to_ts(start_dt),
                "filter[created_at][to]":   to_ts(end_dt),
                "filter[type]":             etype,
                "limit": 100, "page": page,
            }
            r = safe_get(f"{BASE_URL}/api/v4/events", params=params)
            if r.status_code == 204: break
            if not r.ok: break
            data  = r.json()
            items = data.get("_embedded", {}).get("events", [])
            if not items: break
            events.extend([e for e in items if e.get("created_by") in target_ids])
            if "next" not in data.get("_links", {}): break
            page += 1
            time.sleep(0.1)
    return events


def fetch_notes(note_ids):
    notes  = {}
    unique = list(set(note_ids))
    if not unique:
        return notes
    for i in range(0, len(unique), 50):
        batch = unique[i:i+50]
        for entity in ["contacts", "leads"]:
            params = {"limit": 50}
            for j, nid in enumerate(batch):
                params[f"filter[id][{j}]"] = nid
            r = safe_get(f"{BASE_URL}/api/v4/{entity}/notes", params=params)
            if r.ok and r.status_code != 204:
                for note in r.json().get("_embedded", {}).get("notes", []):
                    nid = note.get("id")
                    if nid:
                        notes[nid] = note.get("params", {}) or {}
                if any(nid in notes for nid in batch):
                    break
    return notes


def build_records(events, notes):
    records = []
    for e in sorted(events, key=lambda x: x.get("created_at", 0)):
        etype      = e.get("type", "")
        contact_id = e.get("entity_id")
        created_at = e.get("created_at", 0)
        if not contact_id:
            continue
        note_id = None
        for va in e.get("value_after", []):
            note_id = va.get("note", {}).get("id")
            if note_id: break
        p         = notes.get(note_id, {}) if note_id else {}
        duration  = p.get("duration", -1)
        direction = p.get("direction", "")
        if not direction:
            direction = "inbound" if etype == "incoming_call" else "outbound"
        records.append({
            "direction":  direction,
            "duration":   duration,
            "contact_id": contact_id,
            "created_at": created_at,
        })
    return records


# ══════════════════════════════════════════════════════════════
# HISOB-KITOB
# ══════════════════════════════════════════════════════════════
def calc(records):
    hour_sets    = {label: set() for label, _, _ in HOUR_SLOTS}
    recall_gaps  = []
    in_a         = 0
    out_a        = 0
    out_recall   = 0

    contact_state = {}   # cid -> None | "missed" | "recalled" | "answered"
    missed_time   = {}   # cid -> birinchi/yangilangan missed timestamp

    def add_to_hour(cid, ts):
        h = from_ts(ts).hour
        for label, sh, eh in HOUR_SLOTS:
            if sh <= h < eh:
                hour_sets[label].add(cid)
                break

    for r in sorted(records, key=lambda x: x["created_at"]):
        cid = r["contact_id"]
        d   = r["direction"]
        dur = r["duration"]
        ts  = r["created_at"]

        add_to_hour(cid, ts)
        state = contact_state.get(cid)

        if d == "inbound":
            if dur == 0 or dur == -1:
                if state is None or state == "answered":
                    contact_state[cid] = "missed"
                    missed_time[cid]   = ts
                elif state == "missed":
                    missed_time[cid] = ts
                elif state == "recalled":
                    contact_state[cid] = "missed"
                    missed_time[cid]   = ts
            else:
                if state is None or state == "answered":
                    in_a += 1
                    contact_state[cid] = "answered"
                elif state in ("missed", "recalled"):
                    contact_state[cid] = "answered"
                    missed_time.pop(cid, None)

        elif d == "outbound":
            if dur > 0:
                if state == "missed":
                    contact_state[cid] = "recalled"
                    out_recall += 1
                    if cid in missed_time:
                        missed_ts = missed_time.pop(cid)
                        gap_min   = round((ts - missed_ts) / 60, 1)
                        if 0 < gap_min <= 600:
                            recall_gaps.append(gap_min)
                else:
                    out_a += 1

    not_recalled = sum(1 for s in contact_state.values() if s == "missed")
    recalled     = sum(1 for s in contact_state.values() if s == "recalled")
    missed_total = not_recalled + recalled
    total        = in_a + out_a + out_recall + missed_total

    ans   = round((in_a + out_a + out_recall) / total * 100) if total else 0
    rec   = round(recalled     / missed_total * 100) if missed_total else 0
    norec = round(not_recalled / missed_total * 100) if missed_total else 0
    avg_recall = round(sum(recall_gaps) / len(recall_gaps), 1) if recall_gaps else 0.0

    hours = {label: len(s) for label, s in hour_sets.items()}

    return {
        "total":              total,
        "incoming":           in_a,
        "outgoing":           out_a + out_recall,
        "out_recall":         out_recall,
        "missed":             missed_total,
        "recalled":           recalled,
        "not_recalled":       not_recalled,
        "answer_rate":        ans,
        "recall_rate":        rec,
        "no_recall_pct":      norec,
        "avg_recall_minutes": avg_recall,
        "hours":              hours,
    }


def filter_records(records, start_dt, end_dt):
    s = to_ts(start_dt)
    e = to_ts(end_dt)
    return [x for x in records if s <= x["created_at"] <= e]


# ══════════════════════════════════════════════════════════════
# CHIQISH
# ══════════════════════════════════════════════════════════════
def bar(v, mx, w=20):
    f = round(v/mx*w) if mx else 0
    return "█"*f + "░"*(w-f)


def print_stats(title, s):
    print("\n" + "="*65)
    print(f"  {title}")
    print("="*65)
    print(f"  Jami qo'ng'iroqlar      : {s['total']}")
    print(f"  Kiruvchi (javob berildi): {s['incoming']}")
    print(f"  Chiquvchi               : {s['outgoing']}")
    print(f"  Qayta chiqilgan (chiq.) : {s['out_recall']}")
    print(f"  Propushenniy (jami)     : {s['missed']}")
    print(f"    -> Qayta chiqilgan     : {s['recalled']}")
    print(f"    -> Qayta chiqilmagan   : {s['not_recalled']}")
    print(f"  Javob berish %          : {s['answer_rate']}%")
    print(f"  Qayta chiqish %         : {s['recall_rate']}%")
    print(f"  Qayta chiqilmagan %     : {s['no_recall_pct']}%")
    print(f"  O'rtacha qayta aloqa    : {s['avg_recall_minutes']} daqiqa")
    print("-"*65)
    mx = max(s["hours"].values()) if any(s["hours"].values()) else 1
    for label, v in s["hours"].items():
        print(f"  {label}  {bar(v,mx)}  {v}")
    print("="*65)


# ══════════════════════════════════════════════════════════════
# DB UPSERT
# ══════════════════════════════════════════════════════════════
def _vals(st):
    h = st["hours"]
    return (
        st["total"], st["incoming"], st["outgoing"], st["out_recall"],
        st["missed"], st["recalled"], st["not_recalled"],
        st["answer_rate"], st["recall_rate"], st["no_recall_pct"], st["avg_recall_minutes"],
        h.get("09:00-11:00", 0), h.get("11:00-13:00", 0), h.get("13:00-15:00", 0),
        h.get("15:00-17:00", 0), h.get("17:00-19:00", 0), h.get("19:00-21:00", 0),
        h.get("21:00-23:00", 0),
    )

_COLS = """total_calls, incoming_answered, outgoing_answered, out_recall_clients,
           missed_clients, recalled_clients, not_recalled_clients,
           answer_rate, recall_rate, no_recall_pct, avg_recall_minutes,
           h_09_11, h_11_13, h_13_15, h_15_17, h_17_19, h_19_21, h_21_23"""

_SET = """total_calls=EXCLUDED.total_calls, incoming_answered=EXCLUDED.incoming_answered,
          outgoing_answered=EXCLUDED.outgoing_answered, out_recall_clients=EXCLUDED.out_recall_clients,
          missed_clients=EXCLUDED.missed_clients, recalled_clients=EXCLUDED.recalled_clients,
          not_recalled_clients=EXCLUDED.not_recalled_clients,
          answer_rate=EXCLUDED.answer_rate, recall_rate=EXCLUDED.recall_rate,
          no_recall_pct=EXCLUDED.no_recall_pct, avg_recall_minutes=EXCLUDED.avg_recall_minutes,
          h_09_11=EXCLUDED.h_09_11, h_11_13=EXCLUDED.h_11_13, h_13_15=EXCLUDED.h_13_15,
          h_15_17=EXCLUDED.h_15_17, h_17_19=EXCLUDED.h_17_19, h_19_21=EXCLUDED.h_19_21,
          h_21_23=EXCLUDED.h_21_23"""

_PH = ",".join(["%s"] * 18)  # 18 value placeholders


def write_to_db(manager, d_stats, w_stats, m_stats, events_count, duration_ms):
    if not _HAS_PG:
        print("[DB] psycopg2 mavjud emas — DB ga yozilmadi.")
        return
    ssl_opts = {"sslmode": "require"} if "render.com" in DATABASE_URL or "neon.tech" in DATABASE_URL else {}
    conn = psycopg2.connect(DATABASE_URL, **ssl_opts)
    try:
        with conn:
            with conn.cursor() as cur:
                # Ensure out_recall_clients column exists
                for t in ("amo_call_daily_stats", "amo_call_weekly_stats", "amo_call_monthly_stats"):
                    cur.execute(f"ALTER TABLE {t} ADD COLUMN IF NOT EXISTS out_recall_clients INT DEFAULT 0")

                week_end  = (WEEK_START  + timedelta(days=6)).date()
                month_end = (MONTH_START.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)

                cur.execute(f"""
                    INSERT INTO amo_call_daily_stats (stat_date, manager_name, {_COLS})
                    VALUES (%s, %s, {_PH})
                    ON CONFLICT (stat_date, manager_name) DO UPDATE SET {_SET}
                """, (STAT_DATE, manager) + _vals(d_stats))

                cur.execute(f"""
                    INSERT INTO amo_call_weekly_stats
                        (stat_week, manager_name, period_start, period_end, {_COLS})
                    VALUES (%s, %s, %s, %s, {_PH})
                    ON CONFLICT (stat_week, manager_name) DO UPDATE SET
                        period_start=EXCLUDED.period_start, period_end=EXCLUDED.period_end, {_SET}
                """, (STAT_WEEK, manager, STAT_WEEK, week_end) + _vals(w_stats))

                cur.execute(f"""
                    INSERT INTO amo_call_monthly_stats
                        (stat_month, manager_name, period_start, period_end, {_COLS})
                    VALUES (%s, %s, %s, %s, {_PH})
                    ON CONFLICT (stat_month, manager_name) DO UPDATE SET
                        period_start=EXCLUDED.period_start, period_end=EXCLUDED.period_end, {_SET}
                """, (STAT_MONTH, manager, STAT_MONTH, month_end.date()) + _vals(m_stats))

                cur.execute("""
                    INSERT INTO amo_sync_logs
                        (synced_at, status, manager, events_count, duration_ms)
                    VALUES (NOW(), 'success', %s, %s, %s)
                """, (manager, events_count, duration_ms))

        print(f"\n[DB] Yozildi: kunlik={STAT_DATE}, haftalik={STAT_WEEK}, oylik={STAT_MONTH}")
    except Exception as exc:
        try:
            with conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        INSERT INTO amo_sync_logs (synced_at, status, error_msg, duration_ms)
                        VALUES (NOW(), 'error', %s, %s)
                    """, (str(exc), duration_ms))
        except Exception:
            pass
        print(f"[DB XATO] {exc}")
        raise
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════
def main():
    t0 = time.time()

    target_ids = get_target_ids()
    if not target_ids:
        print("XATO: Menejer topilmadi!"); sys.exit(1)
    manager = list(target_ids.values())[0]

    FETCH_START = min(MONTH_START, WEEK_START)
    events = fetch_events(target_ids, FETCH_START, MONTH_END)

    note_ids = []
    for e in events:
        for va in e.get("value_after", []):
            nid = va.get("note", {}).get("id")
            if nid: note_ids.append(nid)
    notes = fetch_notes(note_ids)

    all_records = build_records(events, notes)

    d_recs = filter_records(all_records, DAY_START,   DAY_END)
    w_recs = filter_records(all_records, WEEK_START,  WEEK_END)
    m_recs = filter_records(all_records, MONTH_START, MONTH_END)

    d_stats = calc(d_recs)
    w_stats = calc(w_recs)
    m_stats = calc(m_recs)

    print_stats(f"KUNLIK   | {STAT_DATE} | {manager}", d_stats)
    print_stats(f"HAFTALIK | {WEEK_START.strftime('%d.%m')} → {WEEK_END.strftime('%d.%m.%Y')} | {manager}", w_stats)
    print_stats(f"OYLIK    | {MONTH_START.strftime('%d.%m')} → {MONTH_END.strftime('%d.%m.%Y')} | {manager}", m_stats)

    duration_ms = int((time.time() - t0) * 1000)
    write_to_db(manager, d_stats, w_stats, m_stats, len(events), duration_ms)


if __name__ == "__main__":
    main()
