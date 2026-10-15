import { test, expect } from "@playwright/test";

// API/contract layer: hits the routes directly via HTTP, no browser.
// Distinct from unit tests (pure function logic, in-memory DB) and
// E2E tests (full browser UI flow) — this layer checks the actual
// HTTP contract: status codes, response shape, error handling.

test.describe("POST /api/events/[id]/register", () => {
  test("returns 201 and a confirmed status for a valid registration", async ({ request }) => {
    const res = await request.post("/api/events/1/register", {
      data: { name: "API Test User", email: `api-${Date.now()}@example.com` },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(["confirmed", "waitlisted"]).toContain(body.status);
    expect(body.registrationId).toEqual(expect.any(Number));
  });

  test("returns 400 for a missing name", async ({ request }) => {
    const res = await request.post("/api/events/1/register", {
      data: { email: `api-${Date.now()}@example.com` },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test("returns 400 for a malformed email", async ({ request }) => {
    const res = await request.post("/api/events/1/register", {
      data: { name: "Bad Email", email: "not-an-email" },
    });
    expect(res.status()).toBe(400);
  });

  test("returns 400 for a non-existent event", async ({ request }) => {
    const res = await request.post("/api/events/999999/register", {
      data: { name: "Nobody", email: `api-${Date.now()}@example.com` },
    });
    expect(res.status()).toBe(400);
  });

  test("returns 400 for malformed JSON", async ({ request }) => {
    const res = await request.post("/api/events/1/register", {
      headers: { "Content-Type": "application/json" },
      data: "not json{{{",
    });
    expect(res.status()).toBe(400);
  });

  test("same idempotency key twice returns the same registration, not a duplicate", async ({ request }) => {
    const email = `api-idem-${Date.now()}@example.com`;
    const key = `idem-${Date.now()}`;
    const first = await request.post("/api/events/1/register", {
      data: { name: "Idempotent User", email, idempotencyKey: key },
    });
    const second = await request.post("/api/events/1/register", {
      data: { name: "Idempotent User", email, idempotencyKey: key },
    });
    const firstBody = await first.json();
    const secondBody = await second.json();
    expect(secondBody.registrationId).toBe(firstBody.registrationId);
  });
});

test.describe("GET /api/events/[id]", () => {
  test("returns event details with live counts", async ({ request }) => {
    const res = await request.get("/api/events/1");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      id: 1,
      capacity: expect.any(Number),
      confirmedCount: expect.any(Number),
      waitlistCount: expect.any(Number),
    });
  });

  test("returns 404 for a non-existent event", async ({ request }) => {
    const res = await request.get("/api/events/999999");
    expect(res.status()).toBe(404);
  });
});

test.describe("POST /api/registrations/[id]/cancel", () => {
  test("returns 404 for a non-existent registration", async ({ request }) => {
    const res = await request.post("/api/registrations/999999/cancel");
    expect(res.status()).toBe(404);
  });

  test("cancelling a real registration returns 200", async ({ request }) => {
    const reg = await request.post("/api/events/1/register", {
      data: { name: "To Be Cancelled", email: `api-cancel-${Date.now()}@example.com` },
    });
    const { registrationId } = await reg.json();
    const res = await request.post(`/api/registrations/${registrationId}/cancel`);
    expect(res.status()).toBe(200);
  });
});
