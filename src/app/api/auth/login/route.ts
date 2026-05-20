import { NextResponse } from "next/server";
import { z } from "zod";
import { publicUser, verifyUser } from "@/lib/server/store";
import { setSessionCookie, signSession } from "@/lib/server/session";

const schema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const user = await verifyUser(parsed.data.email, parsed.data.password);
  if (!user) return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });

  await setSessionCookie(await signSession({ id: user.id, username: user.username }));
  return NextResponse.json({ user: publicUser(user) });
}
