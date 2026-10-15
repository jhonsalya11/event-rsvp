import { NextRequest, NextResponse } from "next/server";
import { cancelRegistration } from "@/lib/registration";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = cancelRegistration(Number(id));
  if (!result.ok) {
    return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
