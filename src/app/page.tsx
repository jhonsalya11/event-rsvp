"use client";

import { useEffect, useId, useState } from "react";

type EventInfo = {
  id: number;
  title: string;
  description: string;
  capacity: number;
  confirmedCount: number;
  waitlistCount: number;
};

const EVENT_ID = 1;

export default function Home() {
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const nameId = useId();
  const emailId = useId();

  async function loadEvent() {
    const res = await fetch(`/api/events/${EVENT_ID}`);
    if (res.ok) setEvent(await res.json());
  }

  useEffect(() => {
    loadEvent();
    // Fix for bug #5: a fresh idempotency key per form load/reset. Even a
    // fast double-click now sends the same key twice, and the server
    // dedupes on it instead of creating two registrations.
    setIdempotencyKey(crypto.randomUUID());
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return; // fix: ignore re-entrant submits while one is in flight
    setSubmitting(true);
    try {
      const res = await fetch(`/api/events/${EVENT_ID}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, idempotencyKey }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(
          data.status === "confirmed"
            ? "You're in! See you there."
            : `Event is full — you're #${data.position} on the waitlist.`
        );
        setName("");
        setEmail("");
        setIdempotencyKey(crypto.randomUUID());
        loadEvent();
      } else {
        setResult(data.error ?? "Something went wrong.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!event) return null;

  const seatsLeft = Math.max(0, event.capacity - event.confirmedCount);
  const isFull = seatsLeft === 0;

  return (
    <div className="min-h-screen bg-zinc-50 py-16 px-4">
      <main className="mx-auto max-w-lg rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-zinc-900">{event.title}</h1>
        <p className="mt-2 text-zinc-600">{event.description}</p>

        <div className="mt-4 flex items-center gap-3 text-sm" role="status" aria-live="polite">
          <span className="text-zinc-500">
            {event.confirmedCount}/{event.capacity} confirmed
          </span>
          {/* Fix for bug #6: text/weight difference (not just color) carries
              the state, and contrast now passes WCAG AA for normal text. */}
          {isFull ? (
            <span className="rounded-full bg-orange-100 px-3 py-1 font-semibold text-orange-800">
              Sold out — join waitlist
            </span>
          ) : (
            <span className="rounded-full bg-green-100 px-3 py-1 font-semibold text-green-800">
              {seatsLeft} seats left
            </span>
          )}
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor={nameId} className="mb-1 block text-sm font-medium text-zinc-700">
              Full name
            </label>
            <input
              id={nameId}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-lg border border-zinc-300 px-4 py-2 focus:border-zinc-500 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor={emailId} className="mb-1 block text-sm font-medium text-zinc-700">
              Email
            </label>
            <input
              id={emailId}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-zinc-300 px-4 py-2 focus:border-zinc-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Submitting…" : isFull ? "Join waitlist" : "Register"}
          </button>
        </form>

        {result && (
          <p className="mt-4 text-sm text-zinc-700" role="status" aria-live="polite">
            {result}
          </p>
        )}

        <a href="/admin" className="mt-8 block text-center text-xs text-zinc-600 hover:text-zinc-900">
          Organizer view
        </a>
      </main>
    </div>
  );
}
