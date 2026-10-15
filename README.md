# event-rsvp

A small event registration + waitlist app, built as a **test-automation
showcase**: the first commit ([`3c79562`](../../commit/3c79562)) ships
with 6 intentionally seeded bugs, one per layer of a real test pyramid.
Each one is documented in [`docs/bugs.md`](docs/bugs.md) with the actual
failing-test evidence, then fixed in later commits with before/after
numbers in [`docs/evidence/`](docs/evidence).

**Live demo:** https://event-rsvp-red.vercel.app (Next.js on Vercel +
Postgres on Neon — a separate, parallel data layer from the SQLite path
below, see `docs/evidence/deployment-notes.md` for 3 real deployment
failures hit getting it there, and `docs/evidence/vercel-load-test-results.md`
for what the same load test found on a genuinely multi-instance
deployment vs. running locally).

Full write-up: *[link to the /work article goes here once published]*

## The app

Register for an event with a limited number of seats. Once full, new
registrants join a waitlist; cancelling a confirmed seat promotes the
next person in line.

## The test pyramid

| Layer | Tool | What it catches |
|---|---|---|
| Unit | Vitest | Capacity off-by-one, email validation |
| API | Playwright (`request` fixture) | HTTP contract: status codes, error shapes, idempotency |
| E2E | Playwright (browser) | Registration flow, double-submit idempotency |
| Accessibility | Playwright + axe-core | WCAG contrast, semantic HTML |
| Load | k6 | Race condition under concurrent registrations |

```bash
npm run test:unit   # Vitest
npm run test:e2e    # Playwright: API + browser E2E + accessibility
                     # (needs: npx playwright install chromium)
npm run test:load   # k6 (needs: k6 installed separately, server running)
```

CI (`.github/workflows/ci.yml`) runs unit + E2E + build on every push.

## Stack

Next.js (App Router), TypeScript, Tailwind CSS. SQLite (better-sqlite3)
for local dev and the whole test suite; Postgres (Neon) for the
production deployment — see `src/lib/data.ts` for the selector.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Admin/organizer
view is at `/admin`. Uses SQLite automatically — no setup needed. Set
`DATABASE_URL` (see `.env.example`) to run against Postgres instead.
