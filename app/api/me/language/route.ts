import { NextRequest, NextResponse } from "next/server";
import { withAuthReadOnly } from "@/lib/auth-middleware";
import { parseLanguage } from "@/lib/telegram-auth";
import { getUserSummaryByTelegramId, updateUserLanguage } from "@/lib/users";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.clone().json()) as {
      language?: string;
    };
    const user = await withAuthReadOnly(request);
    const language = parseLanguage(body.language);
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
