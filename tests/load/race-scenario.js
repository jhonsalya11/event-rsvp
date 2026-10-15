import http from "k6/http";
import { check } from "k6";

// Targeted scenario for bug #4 (waitlist promotion race): fires both
// cancellations in the SAME batch call, so k6 sends them essentially
// simultaneously, not sequentially. Run tests/load/seed-race-scenario.js
// first and pass its output via env vars.
//
// Usage:
//   node tests/load/seed-race-scenario.js   # prints eventId/confirmedIdA/B
//   EVENT_ID=.. CONFIRMED_A=.. CONFIRMED_B=.. k6 run tests/load/race-scenario.js

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const CONFIRMED_A = __ENV.CONFIRMED_A;
const CONFIRMED_B = __ENV.CONFIRMED_B;

export const options = { vus: 1, iterations: 1 };

export default function () {
  if (!CONFIRMED_A || !CONFIRMED_B) {
    throw new Error("Set CONFIRMED_A and CONFIRMED_B env vars (see seed-race-scenario.js output)");
  }

  const responses = http.batch([
    ["POST", `${BASE_URL}/api/registrations/${CONFIRMED_A}/cancel`, null, { headers: { "Content-Type": "application/json" } }],
    ["POST", `${BASE_URL}/api/registrations/${CONFIRMED_B}/cancel`, null, { headers: { "Content-Type": "application/json" } }],
  ]);

  check(responses[0], { "cancel A: 200": (r) => r.status === 200 });
  check(responses[1], { "cancel B: 200": (r) => r.status === 200 });
}
