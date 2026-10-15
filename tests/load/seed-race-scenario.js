// Seeds a tiny event for the bug #4 (waitlist promotion race) k6
// scenario: capacity 2, two confirmed registrations, two waitlisted.
// Prints {eventId, confirmedIdA, confirmedIdB} as JSON so the shell
// wrapper can pass them to k6 as env vars.
const path = require("path");
const Database = require("better-sqlite3");

const db = new Database(path.join(process.cwd(), "data.db"));
db.pragma("journal_mode = WAL");

const ev = db
  .prepare("INSERT INTO events (title, description, capacity) VALUES (?, ?, ?)")
  .run("Race Scenario Event", "seeded for bug #4 k6 test", 2);
const eventId = Number(ev.lastInsertRowid);

const a = db
  .prepare(
    "INSERT INTO registrations (event_id, name, email, status) VALUES (?, ?, ?, 'confirmed')"
  )
  .run(eventId, "Confirmed A", "race-a@example.com");
const b = db
  .prepare(
    "INSERT INTO registrations (event_id, name, email, status) VALUES (?, ?, ?, 'confirmed')"
  )
  .run(eventId, "Confirmed B", "race-b@example.com");
db.prepare(
  "INSERT INTO registrations (event_id, name, email, status, waitlist_position) VALUES (?, ?, ?, 'waitlisted', 1)"
).run(eventId, "Waitlist C", "race-c@example.com");
db.prepare(
  "INSERT INTO registrations (event_id, name, email, status, waitlist_position) VALUES (?, ?, ?, 'waitlisted', 2)"
).run(eventId, "Waitlist D", "race-d@example.com");

console.log(
  JSON.stringify({
    eventId,
    confirmedIdA: Number(a.lastInsertRowid),
    confirmedIdB: Number(b.lastInsertRowid),
  })
);
