import { NextResponse } from "next/server";
import { z } from "zod";
import { createUser, publicUser } from "@/lib/server/store";
import { setSessionCookie, signSession } from "@/lib/server/session";

const schema = z.object({
  username: z.string().min(2).max(20).regex(/^[a-zA-Z0-9_-]+$/),
  email: z.email(),
  password: z.string().min(8),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  try {
    const user = await createUser(parsed.data.username, parsed.data.email, parsed.data.password);
    await setSessionCookie(await signSession({ id: user.id, username: user.username }));
    return NextResponse.json({ user: publicUser(user) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "register_failed" }, { status: 409 });
  }
}
