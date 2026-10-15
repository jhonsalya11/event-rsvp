# Bugs seeded on purpose

This app was built as a test-automation showcase. The bugs below were
seeded intentionally in the first commit, each designed to be caught by
a specific layer of the test pyramid. This file documents them before
the fix, with the actual failing-test evidence.

## #1 — Race condition (registration)
`registerForEvent` reads the confirmed-count and inserts a new
registration in two separate, non-atomic SQL statements. Two concurrent
requests can both read the same count before either insert lands, and
both proceed to confirm — overbooking the event.
**Caught by:** k6 load test, 50 VUs / 500 requests against a 50-seat
event. Result: **51 confirmed (overbooked by 1)** before the fix,
**exactly 50** after. Full numbers and an honest note on severity (this
app's single-threaded Node + synchronous SQLite driver narrows the race
window compared to a multi-process stack) in
`docs/evidence/load-test-results.md`.

## #2 — Off-by-one (capacity check)
The capacity check uses `>` instead of `>=`, letting exactly one extra
registration slip through as "confirmed" before the waitlist kicks in.
**Caught by:** unit test, `tests/unit/registration.test.ts`.

```
FAIL  registerForEvent — capacity boundary (off-by-one)
Expected: "waitlisted"
Received: "confirmed"
```

## #3 — Validation gap (email format)
No real email format check — anything non-empty is accepted.
**Caught by:** unit test.

```
FAIL  registerForEvent — email validation
Expected: "error"
Received: "confirmed"
```

## #4 — Waitlist promotion race
Cancelling a confirmed registration and promoting the next waitlisted
person happens in two separate statements, not atomically. Two
concurrent cancellations could both try to promote the same slot.
**Honest result:** built the targeted k6 scenario (capacity-2 event,
cancel two confirmed seats concurrently) and ran it 4 times against
the buggy code. **Never reproduced it** — Node's single-threaded,
synchronous-SQLite execution model doesn't actually let the two
operations interleave at the JS level, even without a transaction.
Full writeup, including why the fix is still worth keeping for a
different deployment shape, in `docs/evidence/race-scenario-results.md`.
This file originally claimed this was "caught by a k6 load test" before
that scenario was actually built — that was wrong, and this is the
correction.

## #5 — Double-submit (idempotency)
The registration form has no disabled-while-submitting guard and no
idempotency key sent. A fast double-click fires two POST requests and
creates two registrations for the same person.
**Caught by:** Playwright E2E test simulating a rapid double-click.

## #6 — Accessibility
- The "sold out" badge uses `text-orange-300` on a light background:
  fails WCAG contrast.
- Form inputs have no associated `<label>`, only placeholders.
**Caught by:** Playwright + axe-core automated accessibility scan.

## Bonus — found by the tooling, not planned
The axe-core scan caught two more real issues that weren't part of the
original 6, after the planned ones were fixed:
- A `<p>` rendered as a direct child of a `<ul>` (invalid list
  structure — admin page's "No one yet." / "Empty." placeholders).
- A second insufficient-contrast color, `text-zinc-400` (#9f9fa9) on
  white (2.62:1, needs 4.5:1), on those same placeholders and on the
  homepage's "Organizer view" link — a different color than bug #6's
  orange badge, missed when only the planned bug was in mind.

This is the actual point of running a real scanner instead of just
fixing the bugs you set out to seed: it found things outside the plan.

---

Full failing unit-test run before any fix: see `docs/evidence/unit-before-fix.log`.
Load test before/after numbers: see `docs/evidence/load-test-results.md`.
