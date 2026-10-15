import { Pool } from "@neondatabase/serverless";

// Production data layer (Neon/Postgres), used only when DATABASE_URL is
// set — see src/lib/data.ts for the selector. Local dev and the whole
// existing test suite keep using src/lib/db.ts (SQLite) untouched.
//
// Uses Pool (not the plain neon() HTTP tag function) because the
// registration logic needs real interactive transactions with row
// locking (BEGIN ... SELECT ... FOR UPDATE ... COMMIT), which the
// one-shot HTTP query function can't express.

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (_pool) return _pool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  _pool = new Pool({ connectionString: url });
  return _pool;
}

let _initialized = false;

export async function ensureSchema() {
  if (_initialized) return;
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      capacity INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS registrations (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES events(id),
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('confirmed','waitlisted','cancelled')),
      waitlist_position INTEGER,
      idempotency_key TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_reg_event ON registrations(event_id)`);

  const existing = await pool.query("SELECT COUNT(*)::int AS c FROM events");
  if (existing.rows[0].c === 0) {
    await pool.query(
      `INSERT INTO events (title, description, capacity) VALUES ($1, $2, $3)`,
      [
        "Jakarta QA Meetup #12",
        "An evening of talks on test automation and quality engineering.",
        50,
      ]
    );
  }
  _initialized = true;
}
