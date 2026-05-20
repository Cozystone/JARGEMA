import { NextResponse } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/server/session";
import { store } from "@/lib/server/store";

const schema = z.object({
  emoji: z.string().min(1).max(4),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const { id } = await context.params;
  const snapshot = store.snapshots.find((candidate) => candidate.id === id);
  if (!snapshot) return NextResponse.json({ error: "snapshot_not_found" }, { status: 404 });

  snapshot.reactions[parsed.data.emoji] = (snapshot.reactions[parsed.data.emoji] ?? 0) + 1;
  return NextResponse.json({ reactions: snapshot.reactions });
}
