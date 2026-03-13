import { NextRequest, NextResponse } from "next/server";
import {
  TelegramUpdate,
  getUpdateCommand,
  handleTelegramLanguageSelection,
  handleTelegramRank,
  handleTelegramStart,
  handleTelegramTasks,
  handleTelegramTop,
} from "@/lib/telegram-bot";

export async function POST(request: NextRequest) {
  try {
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const secret = request.headers.get("x-telegram-bot-api-secret-token");

    if (expectedSecret && secret && secret !== expectedSecret) {
      return NextResponse.json({ error: "Invalid webhook secret." }, { status: 401 });
    }

    const update = (await request.json()) as TelegramUpdate;
    const command = getUpdateCommand(update);

    if (command === "language") {
      await handleTelegramLanguageSelection(update);
    } else if (command === "start") {
      await handleTelegramStart(update);
    } else if (command === "rank") {
      await handleTelegramRank(update);
    } else if (command === "tasks") {
      await handleTelegramTasks(update);
    } else if (command === "top") {
      await handleTelegramTop(update);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
