import { NextRequest, NextResponse } from "next/server";
import { ensureCardSchema, getUserSummaryByTelegramId, updateUserLanguage } from "@/lib/cards";
import { authenticateTelegramWebApp, parseLanguage } from "@/lib/telegram-auth";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      initData?: string;
      devUser?: string;
      language?: string;
    };
    const user = authenticateTelegramWebApp(body.initData, { devUser: body.devUser });
    const language = parseLanguage(body.language);

    await ensureCardSchema();
    await updateUserLanguage(user.telegramId, language);

    const updatedUser = await getUserSummaryByTelegramId(user.telegramId);

    return NextResponse.json({
      language,
      user: updatedUser
        ? {
            ...user,
            language: updatedUser.language,
          }
        : {
            ...user,
            language,
          },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update language.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
