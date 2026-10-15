import { getDb } from "./db";

export type RegisterResult =
  | { status: "confirmed"; registrationId: number }
  | { status: "waitlisted"; registrationId: number; position: number }
  | { status: "error"; message: string };

/**
 * Register for an event. Fixed version — see git history / docs/bugs.md
 * for the original seeded bugs and the test failures that caught them.
 */
export function registerForEvent(
  eventId: number,
  name: string,
  email: string,
  idempotencyKey?: string
): RegisterResult {
  const db = getDb();

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!name || !email || !EMAIL_RE.test(email)) {
    return { status: "error", message: "A valid name and email are required." };
  }

  const event = db.prepare("SELECT * FROM events WHERE id = ?").get(eventId) as
    | { id: number; capacity: number }
    | undefined;
  if (!event) return { status: "error", message: "Event not found." };

  // Fix for bug #5 (idempotency): if this idempotencyKey was already used
  // for this event, return the existing registration instead of creating
  // a duplicate. A double-click now resolves to one registration.
  if (idempotencyKey) {
    const existing = db
      .prepare(
        "SELECT * FROM registrations WHERE event_id = ? AND idempotency_key = ? AND status != 'cancelled'"
      )
      .get(eventId, idempotencyKey) as
      | { id: number; status: "confirmed" | "waitlisted"; waitlist_position: number | null }
      | undefined;
    if (existing) {
      return existing.status === "confirmed"
        ? { status: "confirmed", registrationId: existing.id }
        : { status: "waitlisted", registrationId: existing.id, position: existing.waitlist_position ?? 0 };
    }
  }

  // Fix for bug #1 (race condition) + bug #2 (off-by-one): the whole
  // read-then-write runs inside a single IMMEDIATE transaction, which
  // takes a write lock up front — two concurrent calls now serialize
  // instead of both reading the same stale count. The comparison is
  // also corrected to >= so capacity itself is a hard ceiling.
  const tx = db.transaction((): RegisterResult => {
    const confirmedCount = (
      db
        .prepare(
          "SELECT COUNT(*) as c FROM registrations WHERE event_id = ? AND status = 'confirmed'"
        )
        .get(eventId) as { c: number }
    ).c;

    if (confirmedCount >= event!.capacity) {
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
  });

  // better-sqlite3 transactions are synchronous; IMMEDIATE mode acquires
  // the write lock at BEGIN, which is what actually closes the race.
  return tx.immediate();
}

/**
 * Cancel a confirmed registration and promote the next waitlisted person.
 * Fixed version: cancel + promote run inside a single IMMEDIATE
 * transaction, so a concurrent cancel can't promote the same waitlist
 * slot twice.
 */
export function cancelRegistration(registrationId: number): { ok: boolean } {
  const db = getDb();

  const tx = db.transaction((): { ok: boolean } => {
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
        db.prepare(
          "UPDATE registrations SET status = 'confirmed', waitlist_position = NULL WHERE id = ?"
        ).run(next.id);
      }
    }

    return { ok: true };
  });

  return tx.immediate();
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
