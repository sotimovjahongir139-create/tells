"""
AmoCRM → PostgreSQL ETL
Runs nightly (Mon-Sat) to pull call events for target managers and upsert stats.
Requires: psycopg2-binary, python-dotenv, requests
"""

import os
import time
import logging
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
import psycopg2
import psycopg2.extras
import requests

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

DATABASE_URL = os.environ["DATABASE_URL"]
AMOCRM_DOMAIN = os.environ["AMOCRM_DOMAIN"]
AMOCRM_TOKEN = os.environ["AMOCRM_TOKEN"]
TARGET_MANAGERS = [m.strip() for m in os.environ.get("TARGET_MANAGERS", "Asadbek").split(",")]

TZ_OFFSET = 5  # UTC+5 Tashkent
HOUR_SLOTS = [
    ("09:00-11:00", 9, 11),
    ("11:00-13:00", 11, 13),
    ("13:00-15:00", 13, 15),
    ("15:00-17:00", 15, 17),
    ("17:00-19:00", 17, 19),
    ("19:00-21:00", 19, 21),
    ("21:00-23:00", 21, 23),
]

HEADERS = {"Authorization": f"Bearer {AMOCRM_TOKEN}"}
BASE_URL = f"https://{AMOCRM_DOMAIN}"


def safe_get(url, params=None, retries=3):
    for attempt in range(1, retries + 1):
        try:
            r = requests.get(url, headers=HEADERS, params=params, timeout=60)
            return r
        except Exception as e:
            if attempt == retries:
                raise
            log.warning(f"GET {url} attempt {attempt} failed: {e}. Retrying...")
            time.sleep(5 * attempt)


def get_target_user_ids():
    r = safe_get(f"{BASE_URL}/api/v4/users")
    if r.status_code == 401:
        raise RuntimeError("AmoCRM 401: token invalid")
    r.raise_for_status()
    result = {}
    for u in r.json().get("_embedded", {}).get("users", []):
        for name in TARGET_MANAGERS:
            if name.lower() in (u.get("name") or "").lower():
                result[u["id"]] = u["name"]
    return result


def fetch_call_events(user_ids, from_ts, to_ts):
    all_events = []
    for etype in ["incoming_call", "outgoing_call"]:
        page = 1
        while True:
            params = {
                "filter[created_at][from]": from_ts,
                "filter[created_at][to]": to_ts,
                "filter[type]": etype,
                "limit": 100,
                "page": page,
            }
            r = safe_get(f"{BASE_URL}/api/v4/events", params=params)
            if r.status_code in (204, 404):
                break
            if not r.ok:
                break
            data = r.json()
            items = data.get("_embedded", {}).get("events", [])
            if not items:
                break
            filtered = [e for e in items if e.get("created_by") in user_ids]
            all_events.extend(filtered)
            if not data.get("_links", {}).get("next"):
                break
            page += 1
    return all_events


def fetch_notes(note_ids):
    notes = {}
    unique = list(set(note_ids))
    for i in range(0, len(unique), 50):
        batch = unique[i:i + 50]
        params = {"limit": 50}
        for j, nid in enumerate(batch):
            params[f"filter[id][{j}]"] = nid
        for entity in ("contacts", "leads"):
            r = safe_get(f"{BASE_URL}/api/v4/{entity}/notes", params=params)
            if r.ok and r.status_code != 204:
                found = False
                for note in r.json().get("_embedded", {}).get("notes", []):
                    if note.get("id") in batch:
                        notes[note["id"]] = note.get("params", {})
                        found = True
                if found:
                    break
    return notes


def build_records(events, notes):
    records = []
    sorted_events = sorted(events, key=lambda e: e.get("created_at", 0))
    for e in sorted_events:
        contact_id = e.get("entity_id")
        if not contact_id:
            continue
        note_id = None
        for va in e.get("value_after", []):
            if va.get("note", {}).get("id"):
                note_id = va["note"]["id"]
                break
        p = notes.get(note_id, {}) if note_id else {}
        duration = p.get("duration", -1)
        direction = p.get("direction") or (
            "inbound" if e["type"] == "incoming_call" else "outbound"
        )
        records.append({
            "direction": direction,
            "duration": duration,
            "contact_id": contact_id,
            "created_at": e.get("created_at", 0),
        })
    return records


def filter_records(records, from_ts, to_ts):
    return [r for r in records if from_ts <= r["created_at"] <= to_ts]


def calc_stats(records):
    hours = {label: 0 for label, *_ in HOUR_SLOTS}
    missed_first_time = {}
    missed = set()
    recalled = set()
    recall_gaps_mins = []
    in_a = out_a = 0

    sorted_r = sorted(records, key=lambda r: r["created_at"])
    for r in sorted_r:
        cid = r["contact_id"]
        d = r["direction"]
        dur = r["duration"]
        ts = r["created_at"]

        tz_hour = ((ts % 86400) // 3600 + TZ_OFFSET) % 24
        slot = next((label for label, sh, eh in HOUR_SLOTS if sh <= tz_hour < eh), None)

        if d == "inbound":
            if dur <= 0:
                missed.add(cid)
                recalled.discard(cid)
                if cid not in missed_first_time:
                    missed_first_time[cid] = ts
                if slot:
                    hours[slot] += 1
            else:
                missed.discard(cid)
                missed_first_time.pop(cid, None)
                in_a += 1
                if slot:
                    hours[slot] += 1
        elif d == "outbound" and dur > 0:
            out_a += 1
            if slot:
                hours[slot] += 1
            if cid in missed:
                recalled.add(cid)
                missed.discard(cid)
                if cid in missed_first_time:
                    recall_gaps_mins.append((ts - missed_first_time.pop(cid)) / 60)

    total_missed = len(missed) + len(recalled)
    rc = len(recalled)
    nrc = len(missed)
    total = in_a + out_a + total_missed
    answer_rate = round((in_a + out_a) / total * 100) if total else 0
    recall_rate = round(rc / total_missed * 100) if total_missed else 0
    no_recall_pct = round(nrc / total_missed * 100) if total_missed else 0
    avg_recall = (
        round(sum(recall_gaps_mins) / len(recall_gaps_mins) * 10) / 10
        if recall_gaps_mins else 0
    )

    return {
        "total": total,
        "incoming": in_a,
        "outgoing": out_a,
        "missed": total_missed,
        "recalled": rc,
        "not_recalled": nrc,
        "answer_rate": answer_rate,
        "recall_rate": recall_rate,
        "no_recall_pct": no_recall_pct,
        "avg_recall_minutes": avg_recall,
        "hours": hours,
    }


def upsert_daily(cur, stat_date, manager_name, st):
    h = st["hours"]
    cur.execute("""
        INSERT INTO amo_call_daily_stats
            (stat_date, manager_name, total_calls, incoming_answered, outgoing_answered,
             missed_clients, recalled_clients, not_recalled_clients,
             answer_rate, recall_rate, no_recall_pct, avg_recall_minutes,
             h_09_11, h_11_13, h_13_15, h_15_17, h_17_19, h_19_21, h_21_23)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (stat_date, manager_name) DO UPDATE SET
            total_calls = EXCLUDED.total_calls,
            incoming_answered = EXCLUDED.incoming_answered,
            outgoing_answered = EXCLUDED.outgoing_answered,
            missed_clients = EXCLUDED.missed_clients,
            recalled_clients = EXCLUDED.recalled_clients,
            not_recalled_clients = EXCLUDED.not_recalled_clients,
            answer_rate = EXCLUDED.answer_rate,
            recall_rate = EXCLUDED.recall_rate,
            no_recall_pct = EXCLUDED.no_recall_pct,
            avg_recall_minutes = EXCLUDED.avg_recall_minutes,
            h_09_11 = EXCLUDED.h_09_11, h_11_13 = EXCLUDED.h_11_13,
            h_13_15 = EXCLUDED.h_13_15, h_15_17 = EXCLUDED.h_15_17,
            h_17_19 = EXCLUDED.h_17_19, h_19_21 = EXCLUDED.h_19_21,
            h_21_23 = EXCLUDED.h_21_23
    """, (
        stat_date, manager_name,
        st["total"], st["incoming"], st["outgoing"],
        st["missed"], st["recalled"], st["not_recalled"],
        st["answer_rate"], st["recall_rate"], st["no_recall_pct"], st["avg_recall_minutes"],
        h.get("09:00-11:00", 0), h.get("11:00-13:00", 0), h.get("13:00-15:00", 0),
        h.get("15:00-17:00", 0), h.get("17:00-19:00", 0), h.get("19:00-21:00", 0),
        h.get("21:00-23:00", 0),
    ))


def upsert_weekly(cur, week_start, manager_name, st):
    h = st["hours"]
    cur.execute("""
        INSERT INTO amo_call_weekly_stats
            (week_start, manager_name, total_calls, incoming_answered, outgoing_answered,
             missed_clients, recalled_clients, not_recalled_clients,
             answer_rate, recall_rate, no_recall_pct, avg_recall_minutes,
             h_09_11, h_11_13, h_13_15, h_15_17, h_17_19, h_19_21, h_21_23)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (week_start, manager_name) DO UPDATE SET
            total_calls = EXCLUDED.total_calls,
            incoming_answered = EXCLUDED.incoming_answered,
            outgoing_answered = EXCLUDED.outgoing_answered,
            missed_clients = EXCLUDED.missed_clients,
            recalled_clients = EXCLUDED.recalled_clients,
            not_recalled_clients = EXCLUDED.not_recalled_clients,
            answer_rate = EXCLUDED.answer_rate,
            recall_rate = EXCLUDED.recall_rate,
            no_recall_pct = EXCLUDED.no_recall_pct,
            avg_recall_minutes = EXCLUDED.avg_recall_minutes,
            h_09_11 = EXCLUDED.h_09_11, h_11_13 = EXCLUDED.h_11_13,
            h_13_15 = EXCLUDED.h_13_15, h_15_17 = EXCLUDED.h_15_17,
            h_17_19 = EXCLUDED.h_17_19, h_19_21 = EXCLUDED.h_19_21,
            h_21_23 = EXCLUDED.h_21_23
    """, (
        week_start, manager_name,
        st["total"], st["incoming"], st["outgoing"],
        st["missed"], st["recalled"], st["not_recalled"],
        st["answer_rate"], st["recall_rate"], st["no_recall_pct"], st["avg_recall_minutes"],
        h.get("09:00-11:00", 0), h.get("11:00-13:00", 0), h.get("13:00-15:00", 0),
        h.get("15:00-17:00", 0), h.get("17:00-19:00", 0), h.get("19:00-21:00", 0),
        h.get("21:00-23:00", 0),
    ))


def upsert_monthly(cur, month_start, manager_name, st):
    h = st["hours"]
    cur.execute("""
        INSERT INTO amo_call_monthly_stats
            (month_start, manager_name, total_calls, incoming_answered, outgoing_answered,
             missed_clients, recalled_clients, not_recalled_clients,
             answer_rate, recall_rate, no_recall_pct, avg_recall_minutes,
             h_09_11, h_11_13, h_13_15, h_15_17, h_17_19, h_19_21, h_21_23)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (month_start, manager_name) DO UPDATE SET
            total_calls = EXCLUDED.total_calls,
            incoming_answered = EXCLUDED.incoming_answered,
            outgoing_answered = EXCLUDED.outgoing_answered,
            missed_clients = EXCLUDED.missed_clients,
            recalled_clients = EXCLUDED.recalled_clients,
            not_recalled_clients = EXCLUDED.not_recalled_clients,
            answer_rate = EXCLUDED.answer_rate,
            recall_rate = EXCLUDED.recall_rate,
            no_recall_pct = EXCLUDED.no_recall_pct,
            avg_recall_minutes = EXCLUDED.avg_recall_minutes,
            h_09_11 = EXCLUDED.h_09_11, h_11_13 = EXCLUDED.h_11_13,
            h_13_15 = EXCLUDED.h_13_15, h_15_17 = EXCLUDED.h_15_17,
            h_17_19 = EXCLUDED.h_17_19, h_19_21 = EXCLUDED.h_19_21,
            h_21_23 = EXCLUDED.h_21_23
    """, (
        month_start, manager_name,
        st["total"], st["incoming"], st["outgoing"],
        st["missed"], st["recalled"], st["not_recalled"],
        st["answer_rate"], st["recall_rate"], st["no_recall_pct"], st["avg_recall_minutes"],
        h.get("09:00-11:00", 0), h.get("11:00-13:00", 0), h.get("13:00-15:00", 0),
        h.get("15:00-17:00", 0), h.get("17:00-19:00", 0), h.get("19:00-21:00", 0),
        h.get("21:00-23:00", 0),
    ))


def main():
    start = time.time()
    log.info("ETL started")

    target_ids = get_target_user_ids()
    if not target_ids:
        raise RuntimeError(f"No managers found matching: {TARGET_MANAGERS}")
    log.info(f"Managers: {target_ids}")

    now = datetime.now(timezone.utc)
    yesterday = now - timedelta(days=1)
    if yesterday.weekday() == 6:  # Sunday → use Saturday
        yesterday = yesterday - timedelta(days=1)

    day_start = yesterday.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = yesterday.replace(hour=23, minute=59, second=59, microsecond=999999)

    weekday = day_start.weekday()  # 0=Mon
    week_start = day_start - timedelta(days=weekday)
    month_start = day_start.replace(day=1)

    fetch_from = int(min(week_start, month_start).timestamp())
    fetch_to = int(day_end.timestamp())

    events = fetch_call_events(list(target_ids.keys()), fetch_from, fetch_to)
    log.info(f"Fetched {len(events)} events")

    note_ids = [
        va["note"]["id"]
        for e in events
        for va in e.get("value_after", [])
        if va.get("note", {}).get("id")
    ]
    notes = fetch_notes(note_ids)

    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn:
            with conn.cursor() as cur:
                for uid, manager_name in target_ids.items():
                    manager_events = [e for e in events if e.get("created_by") == uid]
                    manager_records = build_records(manager_events, notes)

                    ts = lambda d: int(d.timestamp())

                    d_stats = calc_stats(filter_records(manager_records, ts(day_start), ts(day_end)))
                    w_stats = calc_stats(filter_records(manager_records, ts(week_start), ts(day_end)))
                    m_stats = calc_stats(filter_records(manager_records, ts(month_start), ts(day_end)))

                    upsert_daily(cur, day_start.date(), manager_name, d_stats)
                    upsert_weekly(cur, week_start.date(), manager_name, w_stats)
                    upsert_monthly(cur, month_start.date(), manager_name, m_stats)

                    log.info(
                        f"{manager_name}: day={d_stats['total']} "
                        f"week={w_stats['total']} month={m_stats['total']}"
                    )

                cur.execute("""
                    INSERT INTO amo_sync_logs (synced_at, status, manager, events_count, duration_ms)
                    VALUES (NOW(), 'success', %s, %s, %s)
                """, (list(target_ids.values())[0], len(events), int((time.time() - start) * 1000)))

        log.info(f"ETL done in {time.time() - start:.1f}s")
    except Exception as exc:
        with conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO amo_sync_logs (synced_at, status, error_msg, duration_ms)
                    VALUES (NOW(), 'error', %s, %s)
                """, (str(exc), int((time.time() - start) * 1000)))
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
