import os
import requests
import sys
import time
import psycopg2
from datetime import datetime, timedelta, timezone

AMOCRM_DOMAIN        = os.getenv("AMOCRM_DOMAIN")
AMOCRM_TOKEN         = os.getenv("AMOCRM_TOKEN")
SUPABASE_URL         = os.getenv("SUPABASE_URL")
SUPABASE_DB_PASSWORD = os.getenv("SUPABASE_DB_PASSWORD")
TARGET_MANAGERS      = ["Asadbek"]

if not all([AMOCRM_DOMAIN, AMOCRM_TOKEN, SUPABASE_URL, SUPABASE_DB_PASSWORD]):
    print("XATO: Environment variables topilmadi.")
    sys.exit(1)

def get_db():
    project_id = SUPABASE_URL.replace("https://", "").replace(".supabase.co", "")
    conn = psycopg2.connect(
        host="aws-0-ap-southeast-2.pooler.supabase.com",
        port=5432,
        dbname="postgres",
        user=f"postgres.{project_id}",
        password=SUPABASE_DB_PASSWORD,
        sslmode="require"
    )
    return conn

TZ = timezone(timedelta(hours=5))

def to_ts(dt):
    return int(dt.replace(tzinfo=TZ).timestamp())

def from_ts(ts):
    return datetime.fromtimestamp(ts, tz=TZ).replace(tzinfo=None)

now       = datetime.now()
yesterday = now - timedelta(days=1)

DAY_START   = yesterday.replace(hour=0,  minute=0,  second=0,  microsecond=0)
DAY_END     = yesterday.replace(hour=23, minute=59, second=59, microsecond=0)
MONTH_START = DAY_START.replace(day=1)
MONTH_END   = DAY_END

week_day   = yesterday.weekday()
WEEK_START = (yesterday - timedelta(days=week_day)).replace(hour=0, minute=0, second=0, microsecond=0)
WEEK_END   = DAY_END

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

def safe_get(url, params=None):
    for attempt in range(1, RETRIES + 1):
        try:
            r = requests.get(url, headers=HEADERS, params=params, timeout=TIMEOUT)
            return r
        except (requests.exceptions.ReadTimeout, requests.exceptions.ConnectionError) as e:
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
    start_ts = to_ts(start_dt)
    end_ts   = to_ts(end_dt)
    events   = []
    for etype in ["incoming_call", "outgoing_call"]:
        page = 1
        while True:
            params = {
                "filter[created_at][from]": start_ts,
                "filter[created_at][to]":   end_ts,
                "filter[type]":             etype,
                "limit": 100,
                "page":  page,
            }
            r = safe_get(f"{BASE_URL}/api/v4/events", params=params)
            if r.status_code == 204:
                break
            if not r.ok:
                break
            data  = r.json()
            items = data.get("_embedded", {}).get("events", [])
            if not items:
                break
            filtered = [e for e in items if e.get("created_by") in target_ids]
            events.extend(filtered)
            if "next" not in data.get("_links", {}):
                break
            page += 1
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
            if note_id:
                break
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

def calc(records):
    hours       = {label: 0 for label, _, _ in HOUR_SLOTS}
    missed_time = {}
    missed      = set()
    recld       = set()
    recall_gaps = []
    in_a        = 0
    out_a       = 0

    for r in sorted(records, key=lambda x: x["created_at"]):
        cid = r["contact_id"]
        d   = r["direction"]
        dur = r["duration"]
        ts  = r["created_at"]

        if d == "inbound":
            if dur == 0 or dur == -1:
                if cid in recld:
                    recld.discard(cid)
                missed.add(cid)
                if cid not in missed_time:
                    missed_time[cid] = ts
                h = from_ts(ts).hour
                for label, sh, eh in HOUR_SLOTS:
                    if sh <= h < eh:
                        hours[label] += 1
                        break
            elif dur > 0:
                if cid in missed:
                    missed.discard(cid)
                    missed_time.pop(cid, None)
                in_a += 1
                h = from_ts(ts).hour
                for label, sh, eh in HOUR_SLOTS:
                    if sh <= h < eh:
                        hours[label] += 1
                        break
        elif d == "outbound":
            if dur > 0:
                out_a += 1
                h = from_ts(ts).hour
                for label, sh, eh in HOUR_SLOTS:
                    if sh <= h < eh:
                        hours[label] += 1
                        break
                if cid in missed:
                    recld.add(cid)
                    missed.discard(cid)
                    if cid in missed_time:
                        gap_min = (ts - missed_time.pop(cid)) / 60
                        recall_gaps.append(gap_min)

    m     = len(missed) + len(recld)
    rc    = len(recld)
    nrc   = len(missed)
    total = in_a + out_a + m
    ans   = round((in_a + out_a) / total * 100) if total else 0
    rec   = round(rc / m * 100) if m else 0
    norec = 100 - rec if m else 0
    avg_recall = round(sum(recall_gaps) / len(recall_gaps), 1) if recall_gaps else 0.0

    return {
        "total": total, "incoming": in_a, "outgoing": out_a,
        "missed": m, "recalled": rc, "not_recalled": nrc,
        "answer_rate": ans, "recall_rate": rec, "no_recall_pct": norec,
        "avg_recall_minutes": avg_recall,
        "hours": hours,
    }

def filter_records(records, start_dt, end_dt):
    s = to_ts(start_dt)
    e = to_ts(end_dt)
    return [x for x in records if s <= x["created_at"] <= e]

def hv(s, l):
    return s["hours"].get(l, 0)

def save_daily(cur, stat_date, manager, s):
    cur.execute("DELETE FROM amo_call_daily_stats WHERE stat_date=%s AND manager_name=%s", (stat_date, manager))
    cur.execute("""
        INSERT INTO amo_call_daily_stats (
            stat_date, manager_name,
            total_calls, incoming_answered, outgoing_answered,
            missed_clients, recalled_clients, not_recalled_clients,
            answer_rate, recall_rate, no_recall_pct, avg_recall_minutes,
            h_09_11, h_11_13, h_13_15, h_15_17, h_17_19, h_19_21, h_21_23
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
    """, (
        stat_date, manager,
        s["total"], s["incoming"], s["outgoing"],
        s["missed"], s["recalled"], s["not_recalled"],
        s["answer_rate"], s["recall_rate"], s["no_recall_pct"], s["avg_recall_minutes"],
        hv(s,"09:00-11:00"), hv(s,"11:00-13:00"), hv(s,"13:00-15:00"),
        hv(s,"15:00-17:00"), hv(s,"17:00-19:00"), hv(s,"19:00-21:00"), hv(s,"21:00-23:00"),
    ))
    print(f"   OK daily -> {stat_date} | {manager}")

def save_weekly(cur, stat_week, p_start, p_end, manager, s):
    cur.execute("DELETE FROM amo_call_weekly_stats WHERE stat_week=%s AND manager_name=%s", (stat_week, manager))
    cur.execute("""
        INSERT INTO amo_call_weekly_stats (
            stat_week, manager_name, period_start, period_end,
            total_calls, incoming_answered, outgoing_answered,
            missed_clients, recalled_clients, not_recalled_clients,
            answer_rate, recall_rate, no_recall_pct, avg_recall_minutes,
            h_09_11, h_11_13, h_13_15, h_15_17, h_17_19, h_19_21, h_21_23
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
    """, (
        stat_week, manager, p_start, p_end,
        s["total"], s["incoming"], s["outgoing"],
        s["missed"], s["recalled"], s["not_recalled"],
        s["answer_rate"], s["recall_rate"], s["no_recall_pct"], s["avg_recall_minutes"],
        hv(s,"09:00-11:00"), hv(s,"11:00-13:00"), hv(s,"13:00-15:00"),
        hv(s,"15:00-17:00"), hv(s,"17:00-19:00"), hv(s,"19:00-21:00"), hv(s,"21:00-23:00"),
    ))
    print(f"   OK weekly -> {stat_week} | {manager}")

def save_monthly(cur, stat_month, p_start, p_end, manager, s):
    cur.execute("DELETE FROM amo_call_monthly_stats WHERE stat_month=%s AND manager_name=%s", (stat_month, manager))
    cur.execute("""
        INSERT INTO amo_call_monthly_stats (
            stat_month, manager_name, period_start, period_end,
            total_calls, incoming_answered, outgoing_answered,
            missed_clients, recalled_clients, not_recalled_clients,
            answer_rate, recall_rate, no_recall_pct, avg_recall_minutes,
            h_09_11, h_11_13, h_13_15, h_15_17, h_17_19, h_19_21, h_21_23
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
    """, (
        stat_month, manager, p_start, p_end,
        s["total"], s["incoming"], s["outgoing"],
        s["missed"], s["recalled"], s["not_recalled"],
        s["answer_rate"], s["recall_rate"], s["no_recall_pct"], s["avg_recall_minutes"],
        hv(s,"09:00-11:00"), hv(s,"11:00-13:00"), hv(s,"13:00-15:00"),
        hv(s,"15:00-17:00"), hv(s,"17:00-19:00"), hv(s,"19:00-21:00"), hv(s,"21:00-23:00"),
    ))
    print(f"   OK monthly -> {stat_month} | {manager}")

def main():
    print("=" * 60)
    print(f"  AMOCRM ETL -> Supabase -- {now.strftime('%d.%m.%Y %H:%M')}")
    print("=" * 60)

    print("\n[1] Menejerlar...")
    target_ids = get_target_ids()
    if not target_ids:
        print("XATO: Menejer topilmadi!")
        sys.exit(1)
    manager = list(target_ids.values())[0]
    print(f"   {manager}")

    FETCH_START = min(MONTH_START, WEEK_START)
    print(f"\n[2] Eventlar: {FETCH_START.date()} -> {MONTH_END.date()}")
    events = fetch_events(target_ids, FETCH_START, MONTH_END)
    print(f"   {len(events)} ta event")

    note_ids = []
    for e in events:
        for va in e.get("value_after", []):
            nid = va.get("note", {}).get("id")
            if nid:
                note_ids.append(nid)

    print(f"\n[3] Notes: {len(note_ids)} ta")
    notes = fetch_notes(note_ids)

    all_records = build_records(events, notes)
    print(f"\n[4] Records: {len(all_records)} ta")

    print("\n[5] Hisob-kitob...")
    m_stats = calc(filter_records(all_records, MONTH_START, MONTH_END))
    w_stats = calc(filter_records(all_records, WEEK_START, WEEK_END))
    d_stats = calc(filter_records(all_records, DAY_START, DAY_END))

    print(f"\n[6] Supabase ga saqlanmoqda...")
    conn = get_db()
    cur  = conn.cursor()
    save_daily(cur, STAT_DATE, manager, d_stats)
    save_weekly(cur, STAT_WEEK, WEEK_START.date(), WEEK_END.date(), manager, w_stats)
    save_monthly(cur, STAT_MONTH, MONTH_START.date(), MONTH_END.date(), manager, m_stats)
    conn.commit()
    cur.close()
    conn.close()

    print("\nTAYYOR!\n")

if __name__ == "__main__":
    main()
