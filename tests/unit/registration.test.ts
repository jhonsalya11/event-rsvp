import { beforeEach, describe, expect, it, vi } from "vitest";

// isolate each test with a fresh in-memory db
beforeEach(() => {
  process.env.DB_PATH = ":memory:";
  vi.resetModules();
});

async function freshRegistrationModule() {
  const mod = await import("@/lib/registration");
  const dbMod = await import("@/lib/db");
  return { ...mod, db: dbMod.getDb() };
}

describe("registerForEvent — capacity boundary (off-by-one)", () => {
  it("confirms registrations up to exactly the event capacity, no more", async () => {
    const { registerForEvent, db } = await freshRegistrationModule();
    const event = db
      .prepare("INSERT INTO events (title, description, capacity) VALUES (?, ?, ?)")
      .run("Tiny Event", "desc", 2);
    const eventId = Number(event.lastInsertRowid);

    const r1 = registerForEvent(eventId, "Alice", "alice@example.com");
    const r2 = registerForEvent(eventId, "Bob", "bob@example.com");
    const r3 = registerForEvent(eventId, "Carol", "carol@example.com");

    expect(r1.status).toBe("confirmed");
    expect(r2.status).toBe("confirmed");
    // capacity is 2 — the 3rd registration must NOT be confirmed.
    expect(r3.status).toBe("waitlisted");
  });
});

describe("registerForEvent — email validation", () => {
  it("rejects a malformed email address", async () => {
    const { registerForEvent, db } = await freshRegistrationModule();
    const event = db
      .prepare("INSERT INTO events (title, description, capacity) VALUES (?, ?, ?)")
      .run("Event", "desc", 10);
    const eventId = Number(event.lastInsertRowid);

    const result = registerForEvent(eventId, "Alice", "not-an-email");
    expect(result.status).toBe("error");
  });
});

describe("registerForEvent — waitlist ordering", () => {
  it("assigns waitlist positions in FIFO order", async () => {
    const { registerForEvent, db } = await freshRegistrationModule();
    const event = db
      .prepare("INSERT INTO events (title, description, capacity) VALUES (?, ?, ?)")
      .run("Tiny Event", "desc", 1);
    const eventId = Number(event.lastInsertRowid);

    registerForEvent(eventId, "First", "first@example.com");
    const second = registerForEvent(eventId, "Second", "second@example.com");
    const third = registerForEvent(eventId, "Third", "third@example.com");

    if (second.status === "waitlisted" && third.status === "waitlisted") {
      expect(second.position).toBeLessThan(third.position);
    } else {
      throw new Error("expected both to be waitlisted");
    }
  });
});

describe("cancelRegistration — waitlist promotion", () => {
  it("promotes the first waitlisted person when a confirmed seat is cancelled", async () => {
    const { registerForEvent, cancelRegistration, listRegistrations, db } =
      await freshRegistrationModule();
    const event = db
      .prepare("INSERT INTO events (title, description, capacity) VALUES (?, ?, ?)")
      .run("Tiny Event", "desc", 1);
    const eventId = Number(event.lastInsertRowid);

    const first = registerForEvent(eventId, "First", "first@example.com");
    const second = registerForEvent(eventId, "Second", "second@example.com");
    expect(first.status).toBe("confirmed");
    expect(second.status).toBe("waitlisted");

    if (first.status !== "confirmed") throw new Error("setup failed");
    cancelRegistration(first.registrationId);

    const regs = listRegistrations(eventId) as { name: string; status: string }[];
    const secondReg = regs.find((r) => r.name === "Second");
    expect(secondReg?.status).toBe("confirmed");
  });
});
