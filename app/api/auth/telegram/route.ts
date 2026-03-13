import { NextRequest, NextResponse } from "next/server";
import { authenticateTelegramWebApp } from "@/lib/telegram-auth";
import { ensureCardSchema, getUserSummaryByTelegramId, upsertUser } from "@/lib/cards";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { initData?: string; devUser?: string; referralCode?: string };
    const user = authenticateTelegramWebApp(body.initData, { devUser: body.devUser });
    await ensureCardSchema();
    await upsertUser(user, { referralCode: body.referralCode });
    const persistedUser = await getUserSummaryByTelegramId(user.telegramId);

    return NextResponse.json({
      user: {
        ...user,
        language: persistedUser?.language || user.language,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authentication failed.";

    return NextResponse.json({ error: message }, { status: 401 });
  }
}
