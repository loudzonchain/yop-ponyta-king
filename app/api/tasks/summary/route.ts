import { NextRequest, NextResponse } from "next/server";
import { authenticateTelegramWebApp } from "@/lib/telegram-auth";
import { ensureCardSchema, getTaskSummary, upsertUser } from "@/lib/cards";

export async function GET(request: NextRequest) {
  try {
    const user = authenticateTelegramWebApp(request.headers.get("x-telegram-init-data"), {
      devUser: request.headers.get("x-dev-user"),
    });
    const referralCode = request.headers.get("x-referral-code");

    await ensureCardSchema();
    await upsertUser(user, { referralCode });

    const origin = new URL(request.url).origin;
    const summary = await getTaskSummary(user, origin);

    return NextResponse.json({ summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load tasks.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
