# Load test results — race condition / off-by-one (bug #1 & #2)

Scenario: 50 virtual users firing 500 concurrent registration requests
(`k6 run tests/load/registration.js`) against an event with a fixed
capacity of 50 seats.

## Before fix (commit `3c79562`, seeded bugs)

```
confirmedCount: 51
capacity: 50
```

**Overbooked by 1 seat (51/50)** — consistent across runs. The
count-then-insert in `registerForEvent` wasn't atomic, so the capacity
check could read a stale count under concurrent load.

Note on severity: Node.js is single-threaded and `better-sqlite3` calls
are synchronous, so the classic multi-request race window is narrow —
the result is a clean, consistent off-by-one overbook rather than a
large/variable one. On a multi-process or truly async stack (multiple
API server instances, or an async DB driver) the same unguarded
read-then-write pattern would very likely overbook by much more under
the same load; this app's single-process Node runtime happened to mask
the worst case.

## After fix (current `main`)

```
confirmedCount: 50
capacity: 50
```

**Exactly at capacity — 0 overbooking.** Fix: wrap the count-check and
insert in a single `db.transaction(...).immediate()` call, which takes
SQLite's write lock at `BEGIN` instead of at the first write,
serializing concurrent calls instead of letting them both read the
same stale count. Also corrected the comparison from `>` to `>=`.

## How to reproduce

```bash
# terminal 1
npm run dev

# terminal 2 — reset the DB first for a clean capacity-50 event
rm -f data.db data.db-shm data.db-wal
k6 run tests/load/registration.js
curl -s http://localhost:3000/api/events/1 | python3 -m json.tool
```
