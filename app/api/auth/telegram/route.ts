import { NextRequest, NextResponse } from "next/server";
import { authenticateTelegramWebApp } from "@/lib/telegram-auth";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { initData?: string; devUser?: string };
    const user = authenticateTelegramWebApp(body.initData, { devUser: body.devUser });

    return NextResponse.json({ user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authentication failed.";

    return NextResponse.json({ error: message }, { status: 401 });
  }
}
