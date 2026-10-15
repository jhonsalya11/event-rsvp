import Database from "better-sqlite3";
import path from "path";

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      capacity INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL REFERENCES events(id),
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('confirmed','waitlisted','cancelled')),
      waitlist_position INTEGER,
      idempotency_key TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_reg_event ON registrations(event_id);
  `);

  // seed a default event if empty
  const count = _db.prepare("SELECT COUNT(*) as c FROM events").get() as { c: number };
  if (count.c === 0) {
    _db
      .prepare("INSERT INTO events (title, description, capacity) VALUES (?, ?, ?)")
      .run(
        "Jakarta QA Meetup #12",
        "An evening of talks on test automation and quality engineering.",
        50
      );
  }

  return _db;
}

export function resetDb() {
  // test-only helper: wipe and reseed
  const db = getDb();
  db.exec("DELETE FROM registrations; DELETE FROM events;");
  db.prepare("INSERT INTO events (title, description, capacity) VALUES (?, ?, ?)").run(
    "Jakarta QA Meetup #12",
    "An evening of talks on test automation and quality engineering.",
    50
  );
}
