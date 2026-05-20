import { NextResponse } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/server/session";
import { updateDetection } from "@/lib/server/store";

const schema = z.object({
  classCode: z.string().optional(),
  jds: z.number().min(0).max(100),
  level: z.string().min(1),
});

export async function POST(request: Request) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const classRoom = updateDetection({
    classCode: parsed.data.classCode,
    userId: user.id,
    username: user.username,
    jds: parsed.data.jds,
    level: parsed.data.level,
  });

  return NextResponse.json({ ok: true, classRoom });
}
