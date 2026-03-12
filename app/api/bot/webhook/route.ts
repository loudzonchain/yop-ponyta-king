import { NextRequest, NextResponse } from "next/server";
import { handleTelegramStart } from "@/lib/telegram-bot";

type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: { id: number };
  };
};

export async function POST(request: NextRequest) {
  try {
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const secret = request.headers.get("x-telegram-bot-api-secret-token");

    if (expectedSecret && secret !== expectedSecret) {
      return NextResponse.json({ error: "Invalid webhook secret." }, { status: 401 });
    }

    const update = (await request.json()) as TelegramUpdate;

    if (update.message?.text?.startsWith("/start")) {
      await handleTelegramStart(update);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
