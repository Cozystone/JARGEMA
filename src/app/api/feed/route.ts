import { NextResponse } from "next/server";
import { store } from "@/lib/server/store";

export async function GET() {
  const snapshots = store.snapshots.filter((snapshot) => snapshot.isPublic).slice(0, 20);
  return NextResponse.json({ snapshots, total: snapshots.length, page: 1 });
}
