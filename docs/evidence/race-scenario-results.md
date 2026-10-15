# Race scenario — bug #4 (waitlist promotion), honest results

`docs/bugs.md` originally claimed this bug would be "caught by a k6
load test (targeted scenario)". That scenario didn't exist yet when
this was written. This file is the honest result of actually building
and running it.

## Scenario

Event with capacity 2: two confirmed registrations (A, B), two
waitlisted (C position 1, D position 2). Fire `POST .../cancel` for
both A and B in the same `k6` batch call (as close to simultaneous as
k6's HTTP client can manage), then check the final state.

**Expected if the race condition is real and reachable:** one of C/D
gets promoted twice (or double-confirmed), or the other never gets
promoted at all, leaving `confirmedCount` at 1 with an empty seat and
`waitlistCount` at 1 instead of the correct `confirmedCount: 2,
waitlistCount: 0`.

## Result: could not reproduce, on either version

Ran this 4 times against the pre-fix code (`git show 3c79562`) and
once against the fixed code. **Every run landed on the correct final
state** — `confirmedCount: 2, waitlistCount: 0`, both C and D promoted,
no duplicate or dropped promotion — on both versions.

## Why, honestly

`cancelRegistration` in the buggy version runs two SQL statements back
to back with no `await` between them. Node.js is single-threaded, and
`better-sqlite3` calls are synchronous. Once a request handler starts
executing `cancelRegistration()`, it runs to completion as one
uninterruptible block before the event loop can hand control to the
other concurrent request's handler — so the two "cancel + read next
waitlisted + promote" sequences can't actually interleave at the
JavaScript level, even without a transaction. The only `await` in the
route handler (`await params`) happens *before* `cancelRegistration()`
is called, not inside it, so it doesn't create a window for the race.

This is the same reason bug #1's race showed up as a clean off-by-one
(51/50) rather than a large, unpredictable overbook: this runtime's
concurrency model narrows these races far more than a multi-process
server or an async DB driver would.

## What this means for the fix

The `db.transaction(...).immediate()` fix in `cancelRegistration` is
still correct and worth keeping — it's defensive against a real risk
in a different deployment shape (multiple server instances behind a
load balancer, a worker pool, or swapping `better-sqlite3` for an
async driver like `pg` or a remote database, all of which reintroduce
a real interleaving window). It's just not a bug this specific
single-process Node + synchronous-SQLite build can actually exhibit
under HTTP-level load — so "caught by a k6 load test" was an
overclaim, now corrected in `docs/bugs.md`.

## Reproduce it yourself

```bash
rm -f data.db data.db-shm data.db-wal
npm run dev   # separate terminal

node tests/load/seed-race-scenario.js
# -> {"eventId":N,"confirmedIdA":X,"confirmedIdB":Y}

EVENT_ID=N CONFIRMED_A=X CONFIRMED_B=Y k6 run tests/load/race-scenario.js
curl -s http://localhost:3000/api/events/N
```
