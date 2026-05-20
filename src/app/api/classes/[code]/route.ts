import { NextResponse } from "next/server";
import { store } from "@/lib/server/store";

export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  const classRoom = store.classes.find((candidate) => candidate.code === code.toUpperCase());
  if (!classRoom) return NextResponse.json({ error: "class_not_found" }, { status: 404 });
  return NextResponse.json({ classRoom });
}
