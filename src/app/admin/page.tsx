"use client";

import { useEffect, useState } from "react";

type Registration = {
  id: number;
  name: string;
  email: string;
  status: "confirmed" | "waitlisted" | "cancelled";
  waitlist_position: number | null;
};

const EVENT_ID = 1;

export default function AdminPage() {
  const [regs, setRegs] = useState<Registration[]>([]);

  async function load() {
    const res = await fetch(`/api/events/${EVENT_ID}/registrations`);
    if (res.ok) setRegs(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function cancel(id: number) {
    await fetch(`/api/registrations/${id}/cancel`, { method: "POST" });
    load();
  }

  const confirmed = regs.filter((r) => r.status === "confirmed");
  const waitlisted = regs.filter((r) => r.status === "waitlisted");

  return (
    <div className="min-h-screen bg-zinc-50 py-16 px-4">
      <main className="mx-auto max-w-2xl">
        <a href="/" className="text-sm text-zinc-500 hover:text-zinc-700">
          ← Back
        </a>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900">Organizer view</h1>

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-zinc-900">Confirmed ({confirmed.length})</h2>
          <ul className="mt-3 divide-y divide-zinc-100">
            {confirmed.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-zinc-800">{r.name}</p>
                  <p className="text-xs text-zinc-500">{r.email}</p>
                </div>
                <button
                  onClick={() => cancel(r.id)}
                  className="rounded-lg border border-zinc-300 px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
                >
                  Cancel
                </button>
              </li>
            ))}
            {confirmed.length === 0 && <li className="py-2 text-sm text-zinc-600">No one yet.</li>}
          </ul>
        </section>

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-zinc-900">Waitlist ({waitlisted.length})</h2>
          <ul className="mt-3 divide-y divide-zinc-100">
            {waitlisted.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-zinc-800">
                    #{r.waitlist_position} — {r.name}
                  </p>
                  <p className="text-xs text-zinc-500">{r.email}</p>
                </div>
              </li>
            ))}
            {waitlisted.length === 0 && <li className="py-2 text-sm text-zinc-600">Empty.</li>}
          </ul>
        </section>
      </main>
    </div>
  );
}
