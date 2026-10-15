import * as sqlite from "./registration";
import * as pg from "./registration-pg";

// Selector: Postgres/Neon when DATABASE_URL is set (production/Vercel),
// SQLite otherwise (local dev — and the whole existing test suite,
// which never sets DATABASE_URL and keeps calling src/lib/registration.ts
// directly and synchronously, completely untouched by this file).
//
// Both backends are normalized to an async interface here so API routes
// don't need to care which one is active.

const usePg = !!process.env.DATABASE_URL;

export async function registerForEvent(
  eventId: number,
  name: string,
  email: string,
  idempotencyKey?: string
) {
  return usePg
    ? pg.registerForEvent(eventId, name, email, idempotencyKey)
    : sqlite.registerForEvent(eventId, name, email, idempotencyKey);
}

export async function cancelRegistration(registrationId: number) {
  return usePg ? pg.cancelRegistration(registrationId) : sqlite.cancelRegistration(registrationId);
}

export async function getEventWithCounts(eventId: number) {
  return usePg ? pg.getEventWithCounts(eventId) : sqlite.getEventWithCounts(eventId);
}

export async function listRegistrations(eventId: number) {
  return usePg ? pg.listRegistrations(eventId) : sqlite.listRegistrations(eventId);
}
