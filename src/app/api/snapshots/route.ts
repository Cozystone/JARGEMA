import { NextResponse } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/server/session";
import { addSnapshot } from "@/lib/server/store";

const schema = z.object({
  imageUrl: z.string().startsWith("data:image/"),
  jdsScore: z.number().min(0).max(100),
  caption: z.string().max(100).optional(),
  isPublic: z.boolean().default(false),
  classCode: z.string().optional(),
});

export async function POST(request: Request) {
  const user = await readSession();
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const guestId = `guest_${crypto.randomUUID()}`;
  const snapshot = addSnapshot({
    userId: user?.id ?? guestId,
    username: user?.username ?? "guest",
    imageUrl: parsed.data.imageUrl,
    jdsScore: parsed.data.jdsScore,
    caption: parsed.data.caption ?? "졸음 포착",
    isPublic: parsed.data.isPublic,
    classCode: parsed.data.classCode,
  });

  return NextResponse.json({ snapshot });
}
