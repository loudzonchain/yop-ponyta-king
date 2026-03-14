import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { getUserSummaryByTelegramId } from "@/lib/users";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.clone().json()) as { referralCode?: string };
    const user = await withAuth(request, { referralCode: body.referralCode });
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
