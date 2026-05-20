import { NextResponse } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/server/session";
import { joinClass } from "@/lib/server/store";

const schema = z.object({
  code: z.string().min(4).max(8),
});

export async function POST(request: Request) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  try {
    return NextResponse.json({ classRoom: joinClass(parsed.data.code, user) });
  } catch {
    return NextResponse.json({ error: "class_not_found" }, { status: 404 });
  }
}
