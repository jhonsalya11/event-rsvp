import { NextRequest, NextResponse } from "next/server";
import { listRegistrations } from "@/lib/registration";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const regs = listRegistrations(Number(id));
  return NextResponse.json(regs);
}
