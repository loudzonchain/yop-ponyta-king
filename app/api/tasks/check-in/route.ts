import { NextRequest, NextResponse } from "next/server";
import { authenticateTelegramWebApp } from "@/lib/telegram-auth";
import { claimDailyCheckIn, ensureCardSchema, upsertUser } from "@/lib/cards";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { initData?: string; devUser?: string; referralCode?: string };
    const user = authenticateTelegramWebApp(body.initData, { devUser: body.devUser });

    await ensureCardSchema();
    await upsertUser(user, { referralCode: body.referralCode });

    const result = await claimDailyCheckIn(user);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to check in.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
