import { NextRequest, NextResponse } from "next/server";
import { registerForEvent } from "@/lib/data";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { name, email, idempotencyKey } = body as {
    name?: string;
    email?: string;
    idempotencyKey?: string;
  };

  const result = await registerForEvent(Number(id), name ?? "", email ?? "", idempotencyKey);

  if (result.status === "error") {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }
  return NextResponse.json(result, { status: 201 });
}
