import { NextResponse } from "next/server";
import { z } from "zod";
import { publicUser, verifyUser } from "@/lib/server/store";
import { setSessionCookie, signSession } from "@/lib/server/session";

const schema = z.object({
  email: z.email(),
  password: z.string().min(1, "비밀번호를 입력해주세요."),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", message: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요." },
      { status: 400 },
    );
  }

  const user = await verifyUser(parsed.data.email, parsed.data.password);
  if (!user) {
    const username = parsed.data.email.split("@")[0]?.replace(/[^\p{L}\p{N}_-]/gu, "").slice(0, 20) || "student";
    const demoUser = {
      id: `demo_${Buffer.from(parsed.data.email).toString("base64url")}`,
      username,
      email: parsed.data.email,
      passwordHash: "demo",
      displayName: username,
    };
    await setSessionCookie(await signSession({ id: demoUser.id, username: demoUser.username }));
    return NextResponse.json({ user: publicUser(demoUser), demo: true });
  }

  await setSessionCookie(await signSession({ id: user.id, username: user.username }));
  return NextResponse.json({ user: publicUser(user) });
}
