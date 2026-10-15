import { NextRequest, NextResponse } from "next/server";
import { getEventWithCounts } from "@/lib/data";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const event = await getEventWithCounts(Number(id));
    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    return NextResponse.json(event);
  } catch (err) {
    // TEMP DEBUG ONLY — leaks internal error detail, remove once the
    // Vercel deployment issue is diagnosed. Do not ship this to a real
    // production app.
    return NextResponse.json(
      {
        debugError: true,
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : null,
        hasDatabaseUrl: !!process.env.DATABASE_URL,
      },
      { status: 500 }
    );
  }
}
