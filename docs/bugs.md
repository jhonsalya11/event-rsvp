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
**Caught by:** k6 load test hammering the endpoint concurrently.

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
**Caught by:** k6 load test (targeted scenario).

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

---

Full failing unit-test run before any fix: see `docs/evidence/unit-before-fix.log`.
