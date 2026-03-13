import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import {
  TelegramUpdate,
  getUpdateCommand,
  handleTelegramLanguageSelection,
  handleTelegramRank,
  handleTelegramStart,
  handleTelegramTasks,
  handleTelegramTop,
} from "@/lib/telegram-bot";

function normalizeSecret(value?: string | null) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return "";
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function secretsMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export async function POST(request: NextRequest) {
  try {
    const expectedSecret = normalizeSecret(process.env.TELEGRAM_WEBHOOK_SECRET);
    const secret = normalizeSecret(request.headers.get("x-telegram-bot-api-secret-token"));

    if (expectedSecret) {
      if (!secret || !secretsMatch(secret, expectedSecret)) {
        return NextResponse.json({ error: "Invalid webhook secret." }, { status: 401 });
      }
    }

    const update = (await request.json()) as TelegramUpdate;
    const command = getUpdateCommand(update);

    if (!command) {
      return NextResponse.json({ ok: true });
    }

    try {
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
    } catch (error) {
      console.error("Telegram webhook command failed", {
        command,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
