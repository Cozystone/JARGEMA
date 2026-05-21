import { NextResponse } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/server/session";
import { updateDetection } from "@/lib/server/store";

const schema = z.object({
  classCode: z.string().optional(),
  jds: z.number().min(0).max(100),
  level: z.string().min(1),
  perclos: z.number().min(0).max(100).optional(),
  eyeClosureRatio: z.number().min(0).max(1).optional(),
  microsleepDuration: z.number().min(0).optional(),
  headDrop: z.number().optional(),
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
    perclos: parsed.data.perclos,
    eyeClosureRatio: parsed.data.eyeClosureRatio,
    microsleepDuration: parsed.data.microsleepDuration,
    headDrop: parsed.data.headDrop,
  });

  return NextResponse.json({ ok: true, classRoom });
}
