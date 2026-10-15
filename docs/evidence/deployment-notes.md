# Deploying to Vercel + Neon — what actually went wrong

This is the honest log of getting the Postgres/Neon production path live
on Vercel. Three real, separate failures, each with a different root
cause — documented here instead of glossed over.

## 1. Build failure: ERESOLVE peer-dependency conflict

**Error:** `npm install` exited 1 on Vercel's build step.

**Cause:** `@types/node@^20` vs `vitest@5`'s peer dependency
(`^22.0.0 || >=24.0.0`). We'd been silently working around this
locally the entire time with `npm install ... --legacy-peer-deps` on
every single install command — but Vercel's build runs a plain
`npm install`, with no flag, so it failed there for the first time.

**Fix:** Added `.npmrc` with `legacy-peer-deps=true`, so every
environment (local, CI, Vercel) behaves the same without needing to
remember a flag by hand.

**How it was found:** reproduced in a clean `/tmp` directory locally
with just `package.json` + `package-lock.json`, matching Vercel's
install step exactly, before touching any code.

## 2. Runtime 500: Pool needs an explicit WebSocket constructor

Applied as a precaution based on a well-documented `@neondatabase/serverless`
gotcha (Vercel's serverless Node.js runtime has no native `WebSocket`
global in some configurations) — added `neonConfig.webSocketConstructor = ws`.
**This did not turn out to be the actual cause of the 500** (see #3
below) but it's correct, harmless to keep, and a real gotcha worth
guarding against regardless.

## 3. Runtime 500 (the real cause): `channel_binding=require` in the connection string

**Error:** `password authentication failed for user 'neondb_owner'` —
even though the same credentials worked fine connecting locally and
directly through Neon's own API.

**How it was actually found:** since the Vercel MCP tooling used
throughout this project hit a persistent 403 scope bug on every call
needing an explicit team ID (`GET_DEPLOYMENT_BUILD_LOGS`,
`GET_RUNTIME_LOGS`, `UPDATE_PROJECT_DEPLOYMENT_PROTECTION` all failed
the same way — see commit history), there was no way to read Vercel's
actual runtime logs. Instead, the API route was temporarily patched to
return the real error message and stack trace in the JSON response
body, redeployed, curled, read, then **reverted** immediately after
diagnosis — never left in the shipped code.

**Cause:** Neon's default connection string includes
`channel_binding=require`, a newer libpq/SCRAM parameter.
`@neondatabase/serverless`'s `Pool` didn't negotiate it cleanly in
Vercel's runtime, and the driver surfaced that as a generic
"password authentication failed" rather than a clearer protocol error.

**Fix:** dropped `channel_binding=require` from the `DATABASE_URL`
value in Vercel's environment variables, kept `sslmode=require`.
Redeployed (env var changes alone do **not** trigger a new
deployment — confirmed by checking the deployment list, which stayed
unchanged until a fresh commit was pushed).

## Lesson

None of these three were guessable from reading the code. All three
needed an actual deploy-and-observe loop — the same principle as the
rest of this project's testing philosophy, just applied one level up,
to the deployment pipeline itself.
