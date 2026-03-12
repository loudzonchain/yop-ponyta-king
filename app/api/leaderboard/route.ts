import { NextRequest, NextResponse } from "next/server";
import { authenticateTelegramWebApp } from "@/lib/telegram-auth";
import { ensureCardSchema, listLeaderboard, upsertUser } from "@/lib/cards";

export async function GET(request: NextRequest) {
  try {
    const viewer = authenticateTelegramWebApp(request.headers.get("x-telegram-init-data"), {
      devUser: request.headers.get("x-dev-user"),
    });
    await ensureCardSchema();
    await upsertUser(viewer);
    const leaderboard = await listLeaderboard();

    return NextResponse.json({ leaderboard });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load leaderboard.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
