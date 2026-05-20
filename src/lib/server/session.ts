import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-secret-change-me-at-least-32-chars");

export async function signSession(user: { id: string; username: string }) {
  return new SignJWT(user)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function readSession() {
  const token = (await cookies()).get("jargema_session")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return { id: String(payload.id), username: String(payload.username) };
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string) {
  (await cookies()).set("jargema_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}
