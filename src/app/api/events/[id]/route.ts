import { NextRequest, NextResponse } from "next/server";
import { getEventWithCounts } from "@/lib/registration";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const event = getEventWithCounts(Number(id));
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  return NextResponse.json(event);
}
