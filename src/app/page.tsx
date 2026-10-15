"use client";

import { useEffect, useState } from "react";

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

  async function loadEvent() {
    const res = await fetch(`/api/events/${EVENT_ID}`);
    if (res.ok) setEvent(await res.json());
  }

  useEffect(() => {
    loadEvent();
  }, []);

  // BUG #5 (double-submit): no disabled-while-submitting guard, no
  // idempotency key generated/sent. A fast double-click fires two
  // POST requests and creates two registrations for the same person.
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/events/${EVENT_ID}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email }),
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
      loadEvent();
    } else {
      setResult(data.error ?? "Something went wrong.");
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

        <div className="mt-4 flex items-center gap-3 text-sm">
          <span className="text-zinc-500">
            {event.confirmedCount}/{event.capacity} confirmed
          </span>
          {/* BUG #6 (accessibility): low-contrast badge text, color is the
              only signal of state (no icon/text distinction for screen
              readers or color-blind users). */}
          {isFull ? (
            <span className="rounded-full bg-orange-100 px-3 py-1 text-orange-300">
              Sold out — join waitlist
            </span>
          ) : (
            <span className="rounded-full bg-green-100 px-3 py-1 text-green-700">
              {seatsLeft} seats left
            </span>
          )}
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            {/* BUG #6 continued: input below has no associated <label>,
                only a placeholder — screen readers announce nothing useful. */}
            <input
              type="text"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-lg border border-zinc-300 px-4 py-2 focus:border-zinc-500 focus:outline-none"
            />
          </div>
          <div>
            <input
              type="text"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-zinc-300 px-4 py-2 focus:border-zinc-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-700"
          >
            {isFull ? "Join waitlist" : "Register"}
          </button>
        </form>

        {result && <p className="mt-4 text-sm text-zinc-700">{result}</p>}

        <a href="/admin" className="mt-8 block text-center text-xs text-zinc-400 hover:text-zinc-600">
          Organizer view
        </a>
      </main>
    </div>
  );
}
