import { NextResponse } from "next/server";
import { z } from "zod";
import { createUser, publicUser } from "@/lib/server/store";
import { setSessionCookie, signSession } from "@/lib/server/session";

const schema = z.object({
  username: z.string().trim().min(2, "닉네임은 2자 이상이어야 합니다.").max(20, "닉네임은 20자 이하여야 합니다."),
  email: z.email(),
  password: z.string().min(4, "비밀번호는 4자 이상이어야 합니다."),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_input",
        message: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  try {
    const user = await createUser(parsed.data.username, parsed.data.email, parsed.data.password);
    await setSessionCookie(await signSession({ id: user.id, username: user.username }));
    return NextResponse.json({ user: publicUser(user) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "register_failed" }, { status: 409 });
  }
}
