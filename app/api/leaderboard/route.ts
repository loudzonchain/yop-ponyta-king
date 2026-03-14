import { NextRequest, NextResponse } from "next/server";
import { withAuthReadOnly } from "@/lib/auth-middleware";
import { listLeaderboard, upsertUser } from "@/lib/users";

export async function GET(request: NextRequest) {
  try {
    const viewer = await withAuthReadOnly(request);
    await upsertUser(viewer);
    const leaderboard = await listLeaderboard();

    return NextResponse.json({ leaderboard });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load leaderboard.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
