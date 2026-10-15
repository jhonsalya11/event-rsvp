import type { PoolClient } from "@neondatabase/serverless";
import { getPool, ensureSchema } from "./db-pg";
import type { RegisterResult } from "./registration";

// Async Postgres/Neon implementation, same behavior and bug-fixes as
// src/lib/registration.ts (SQLite), adapted for a real multi-instance
// serverless deployment: locks the parent event row with
// `SELECT ... FOR UPDATE` inside a transaction, which is Postgres's
// equivalent of the SQLite IMMEDIATE-transaction fix — it serializes
// concurrent registration/cancellation attempts for the same event
// across different server instances, not just within one Node process.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function registerForEvent(
  eventId: number,
  name: string,
  email: string,
  idempotencyKey?: string
): Promise<RegisterResult> {
  await ensureSchema();

  if (!name || !email || !EMAIL_RE.test(email)) {
    return { status: "error", message: "A valid name and email are required." };
  }

  const pool = getPool();
  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");

    const eventRes = await client.query(
      "SELECT capacity FROM events WHERE id = $1 FOR UPDATE",
      [eventId]
    );
    if (eventRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return { status: "error", message: "Event not found." };
    }
    const capacity: number = eventRes.rows[0].capacity;

    if (idempotencyKey) {
      const existingRes = await client.query(
        "SELECT id, status, waitlist_position FROM registrations WHERE event_id = $1 AND idempotency_key = $2 AND status != 'cancelled'",
        [eventId, idempotencyKey]
      );
      if (existingRes.rows.length > 0) {
        const existing = existingRes.rows[0];
        await client.query("COMMIT");
        return existing.status === "confirmed"
          ? { status: "confirmed", registrationId: existing.id }
          : { status: "waitlisted", registrationId: existing.id, position: existing.waitlist_position ?? 0 };
      }
    }

    const countRes = await client.query(
      "SELECT COUNT(*)::int AS c FROM registrations WHERE event_id = $1 AND status = 'confirmed'",
      [eventId]
    );
    const confirmedCount: number = countRes.rows[0].c;

    if (confirmedCount >= capacity) {
      const posRes = await client.query(
        "SELECT COALESCE(MAX(waitlist_position), 0) + 1 AS p FROM registrations WHERE event_id = $1 AND status = 'waitlisted'",
        [eventId]
      );
      const nextPosition: number = posRes.rows[0].p;
      const insertRes = await client.query(
        "INSERT INTO registrations (event_id, name, email, status, waitlist_position, idempotency_key) VALUES ($1, $2, $3, 'waitlisted', $4, $5) RETURNING id",
        [eventId, name, email, nextPosition, idempotencyKey ?? null]
      );
      await client.query("COMMIT");
      return { status: "waitlisted", registrationId: insertRes.rows[0].id, position: nextPosition };
    }

    const insertRes = await client.query(
      "INSERT INTO registrations (event_id, name, email, status, idempotency_key) VALUES ($1, $2, $3, 'confirmed', $4) RETURNING id",
      [eventId, name, email, idempotencyKey ?? null]
    );
    await client.query("COMMIT");
    return { status: "confirmed", registrationId: insertRes.rows[0].id };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function cancelRegistration(registrationId: number): Promise<{ ok: boolean }> {
  await ensureSchema();
  const pool = getPool();
  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");

    const regRes = await client.query(
      "SELECT id, event_id, status FROM registrations WHERE id = $1",
      [registrationId]
    );
    if (regRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return { ok: false };
    }
    const reg = regRes.rows[0];

    // lock the parent event row so concurrent cancel/register calls for
    // the same event serialize, same as registerForEvent above
    await client.query("SELECT id FROM events WHERE id = $1 FOR UPDATE", [reg.event_id]);

    await client.query("UPDATE registrations SET status = 'cancelled' WHERE id = $1", [registrationId]);

    if (reg.status === "confirmed") {
      const nextRes = await client.query(
        "SELECT id FROM registrations WHERE event_id = $1 AND status = 'waitlisted' ORDER BY waitlist_position ASC LIMIT 1",
        [reg.event_id]
      );
      if (nextRes.rows.length > 0) {
        await client.query(
          "UPDATE registrations SET status = 'confirmed', waitlist_position = NULL WHERE id = $1",
          [nextRes.rows[0].id]
        );
      }
    }

    await client.query("COMMIT");
    return { ok: true };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getEventWithCounts(eventId: number) {
  await ensureSchema();
  const pool = getPool();
  const eventRes = await pool.query("SELECT * FROM events WHERE id = $1", [eventId]);
  if (eventRes.rows.length === 0) return null;
  const confirmedRes = await pool.query(
    "SELECT COUNT(*)::int AS c FROM registrations WHERE event_id = $1 AND status = 'confirmed'",
    [eventId]
  );
  const waitlistRes = await pool.query(
    "SELECT COUNT(*)::int AS c FROM registrations WHERE event_id = $1 AND status = 'waitlisted'",
    [eventId]
  );
  return {
    ...eventRes.rows[0],
    confirmedCount: confirmedRes.rows[0].c,
    waitlistCount: waitlistRes.rows[0].c,
  };
}

export async function listRegistrations(eventId: number) {
  await ensureSchema();
  const pool = getPool();
  const res = await pool.query(
    "SELECT * FROM registrations WHERE event_id = $1 AND status != 'cancelled' ORDER BY status ASC, waitlist_position ASC, id ASC",
    [eventId]
  );
  return res.rows;
}
