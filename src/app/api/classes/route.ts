import { NextResponse } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/server/session";
import { createClass } from "@/lib/server/store";

const schema = z.object({
  name: z.string().min(2).max(40),
});

export async function POST(request: Request) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  return NextResponse.json({ classRoom: createClass(parsed.data.name, user) });
}
