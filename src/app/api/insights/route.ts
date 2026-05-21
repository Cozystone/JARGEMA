import { NextResponse } from "next/server";
import { readSession } from "@/lib/server/session";
import { analyzeUserPatterns } from "@/lib/server/store";

export async function GET() {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  return NextResponse.json({ report: analyzeUserPatterns(user.id) });
}
