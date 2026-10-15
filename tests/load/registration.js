import http from "k6/http";
import { check } from "k6";

// Load test: hammer the registration endpoint concurrently for an event
// with a small, fixed capacity, to catch overbooking caused by the
// race condition seeded in the "before" commit (see docs/bugs.md #1).
//
// Usage: BASE_URL and EVENT_ID point at a freshly-seeded event.
// Run twice for the article: once against the buggy commit, once
// against the fixed one, and compare confirmed-count vs capacity.

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const EVENT_ID = __ENV.EVENT_ID || "1";

export const options = {
  scenarios: {
    burst: {
      executor: "shared-iterations",
      vus: 50,
      iterations: 500,
      maxDuration: "30s",
    },
  },
};

export default function () {
  const email = `load-${__VU}-${__ITER}-${Date.now()}@example.com`;
  const res = http.post(
    `${BASE_URL}/api/events/${EVENT_ID}/register`,
    JSON.stringify({ name: `Load Test ${__VU}-${__ITER}`, email }),
    { headers: { "Content-Type": "application/json" } }
  );
  check(res, {
    "status is 201 or 400": (r) => r.status === 201 || r.status === 400,
  });
}
