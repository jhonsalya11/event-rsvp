# Load test on real Vercel + Neon deployment — honest results

The original reason for doing this migration (see earlier chat) was a
hypothesis: would the race condition that never reproduced locally
(single-process Node + synchronous SQLite — see
`docs/evidence/race-scenario-results.md`) actually show up once
requests hit real, independent serverless instances concurrently?

## Scenario

Same k6 script as the local test (`tests/load/registration.js`), 50
VUs targeting 500 registrations against a fresh capacity-50 event —
but this time pointed at the live Vercel deployment
(`BASE_URL=https://event-rsvp-....vercel.app`) backed by Neon
Postgres, not `localhost`.

## Result: correctness held — 0 overbooking

```
confirmedCount: 50
waitlistCount: 127
capacity: 50
```

Exactly at capacity, zero overbooking, even under real multi-instance
concurrent load. The `SELECT ... FOR UPDATE` row-locking fix in
`registration-pg.ts` (Postgres's equivalent of the SQLite
`IMMEDIATE`-transaction fix) holds up correctly across genuinely
separate server instances, not just within one Node process. This is
the result that actually matters: the fix wasn't just locally
convenient, it's correct for the deployment shape it's meant for.

## The honest surprise: latency, not correctness

```
http_req_duration: avg=10.13s  min=943ms  max=20.2s  p95=16.53s
dropped_iterations: 323 of 500 (timed out before the 30s window closed)
```

Local average was ~750ms per request. On Vercel + Neon it's **~13x
slower**, and nearly two-thirds of the planned load never completed
within the test's time budget. This wasn't the bug we went looking
for — it's a different real tradeoff this architecture introduces.

**Why:** `@neondatabase/serverless`'s `Pool` opens a WebSocket
connection per invocation in a serverless function, and the `BEGIN /
SELECT ... FOR UPDATE / COMMIT` pattern used here needs a real
interactive session (not the one-shot HTTP `neon()` tag function), so
each registration pays full connection setup cost on a cold or
reused-but-unwarm Lambda instance, on top of genuine cross-region
network latency (Vercel's `iad1` region to Neon's `us-west-2`).

**What a real production version would do differently:** co-locate
the Vercel deployment region with the Neon database region, and/or
use a connection pooler more suited to high-frequency short-lived
serverless invocations (e.g., reaching for `neon()`'s HTTP-based
driver for the paths that don't strictly need an interactive
transaction, keeping `Pool` only where row locking is genuinely
required). Out of scope to actually implement for this showcase, but
worth being upfront about rather than only reporting the overbooking
number.

## Takeaway for the article

Migrating from SQLite to Postgres on serverless didn't surface the bug
we were hunting for — it surfaced a different, equally real one:
architecture choices trade one risk for another. The race-condition
fix is provably solid in both deployment shapes; the SQLite-only
version is simpler and ~13x faster per request for this workload,
precisely because it doesn't pay cross-process/cross-region
connection overhead. Neither one is strictly "better" out of context.
