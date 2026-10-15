import { getDb } from "./db";

export type RegisterResult =
  | { status: "confirmed"; registrationId: number }
  | { status: "waitlisted"; registrationId: number; position: number }
  | { status: "error"; message: string };

/**
 * Register for an event. This is the INTENTIONALLY BUGGY first version —
 * see docs/bugs.md for the catalogue of issues seeded here on purpose,
 * each one meant to be caught by a specific layer of the test pyramid.
 */
export function registerForEvent(
  eventId: number,
  name: string,
  email: string,
  idempotencyKey?: string
): RegisterResult {
  const db = getDb();

  // BUG #3 (validation gap): no real email format check, just "not empty".
  // A unit test on this function should catch "not-an-email" being accepted.
  if (!name || !email) {
    return { status: "error", message: "Name and email are required." };
  }

  // BUG #5 (idempotency): no idempotencyKey dedup check here at all yet.
  // Submitting the same form twice (double-click, network retry) creates
  // two registrations. An E2E test that double-clicks submit should catch
  // this; idempotencyKey is accepted as a param but unused on purpose.
  void idempotencyKey;

  const event = db.prepare("SELECT * FROM events WHERE id = ?").get(eventId) as
    | { id: number; capacity: number }
    | undefined;
  if (!event) return { status: "error", message: "Event not found." };

  // BUG #1 (race condition) + BUG #2 (off-by-one), both live in this block:
  // the count-then-insert is NOT wrapped in a transaction, so two concurrent
  // requests can both read the same "confirmed" count before either insert
  // lands, and both proceed to confirm — overbooking the event. A k6 load
  // test hammering this endpoint concurrently is designed to catch it.
  const confirmedCount = (
    db
      .prepare("SELECT COUNT(*) as c FROM registrations WHERE event_id = ? AND status = 'confirmed'")
      .get(eventId) as { c: number }
  ).c;

  // off-by-one: should be >=, this allows exactly capacity + 1 to slip through
  if (confirmedCount > event.capacity) {
    // past capacity: go to waitlist
    const nextPosition = (
      db
        .prepare(
          "SELECT COALESCE(MAX(waitlist_position), 0) + 1 as p FROM registrations WHERE event_id = ? AND status = 'waitlisted'"
        )
        .get(eventId) as { p: number }
    ).p;
    const info = db
      .prepare(
        "INSERT INTO registrations (event_id, name, email, status, waitlist_position, idempotency_key) VALUES (?, ?, ?, 'waitlisted', ?, ?)"
      )
      .run(eventId, name, email, nextPosition, idempotencyKey ?? null);
    return { status: "waitlisted", registrationId: Number(info.lastInsertRowid), position: nextPosition };
  }

  const info = db
    .prepare(
      "INSERT INTO registrations (event_id, name, email, status, idempotency_key) VALUES (?, ?, ?, 'confirmed', ?)"
    )
    .run(eventId, name, email, idempotencyKey ?? null);
  return { status: "confirmed", registrationId: Number(info.lastInsertRowid) };
}

/**
 * Cancel a confirmed registration and promote the next waitlisted person.
 *
 * BUG #4 (waitlist promotion race): promotion reads the "next in line" row
 * and updates it in two separate statements, not atomically. Two concurrent
 * cancellations (or a cancel racing a new registration) can both try to
 * promote, in theory double-confirming one waitlist slot.
 */
export function cancelRegistration(registrationId: number): { ok: boolean } {
  const db = getDb();
  const reg = db.prepare("SELECT * FROM registrations WHERE id = ?").get(registrationId) as
    | { id: number; event_id: number; status: string }
    | undefined;
  if (!reg) return { ok: false };

  db.prepare("UPDATE registrations SET status = 'cancelled' WHERE id = ?").run(registrationId);

  if (reg.status === "confirmed") {
    const next = db
      .prepare(
        "SELECT * FROM registrations WHERE event_id = ? AND status = 'waitlisted' ORDER BY waitlist_position ASC LIMIT 1"
      )
      .get(reg.event_id) as { id: number } | undefined;
    if (next) {
      db.prepare("UPDATE registrations SET status = 'confirmed', waitlist_position = NULL WHERE id = ?").run(
        next.id
      );
    }
  }

  return { ok: true };
}

export function getEventWithCounts(eventId: number) {
  const db = getDb();
  const event = db.prepare("SELECT * FROM events WHERE id = ?").get(eventId) as
    | { id: number; title: string; description: string; capacity: number }
    | undefined;
  if (!event) return null;
  const confirmedCount = (
    db
      .prepare("SELECT COUNT(*) as c FROM registrations WHERE event_id = ? AND status = 'confirmed'")
      .get(eventId) as { c: number }
  ).c;
  const waitlistCount = (
    db
      .prepare("SELECT COUNT(*) as c FROM registrations WHERE event_id = ? AND status = 'waitlisted'")
      .get(eventId) as { c: number }
  ).c;
  return { ...event, confirmedCount, waitlistCount };
}

export function listRegistrations(eventId: number) {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM registrations WHERE event_id = ? AND status != 'cancelled' ORDER BY status ASC, waitlist_position ASC, id ASC"
    )
    .all(eventId);
}
