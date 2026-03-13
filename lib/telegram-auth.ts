import crypto from "node:crypto";
import { getDevUser } from "@/lib/dev-user";
import { AuthenticatedAppUser, AppLanguage, TelegramUser } from "@/types/telegram";

type AuthOptions = {
  devUser?: string | null;
};

function buildDataCheckString(params: URLSearchParams) {
  return [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function verifyHash(initData: string, botToken: string) {
  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");

  if (!receivedHash) {
    return false;
  }

  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const expectedHash = crypto
    .createHmac("sha256", secret)
    .update(buildDataCheckString(params))
    .digest("hex");

  return crypto.timingSafeEqual(Buffer.from(expectedHash), Buffer.from(receivedHash));
}

export function parseLanguage(value?: string): AppLanguage {
  return value === "ja" ? "ja" : "en";
}

export function mapTelegramUser(user: TelegramUser): AuthenticatedAppUser {
  const displayName = [user.first_name, user.last_name].filter(Boolean).join(" ");

  return {
    telegramId: user.id,
    username: user.username,
    firstName: user.first_name,
    lastName: user.last_name,
    displayName,
    language: parseLanguage(user.language_code),
    authSource: "telegram",
  };
}

export function authenticateTelegramWebApp(
  initData?: string | null,
  options?: AuthOptions,
): AuthenticatedAppUser {
  const allowDevFallback = process.env.NEXT_PUBLIC_DEV_FALLBACK_AUTH === "true";

  if (!initData) {
    if (allowDevFallback) {
      return getDevUser(options?.devUser || undefined);
    }

    throw new Error("Missing Telegram init data.");
  }

  const botToken = process.env.TELEGRAM_WEBAPP_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    throw new Error("Missing Telegram bot token.");
  }

  if (!verifyHash(initData, botToken)) {
    throw new Error("Invalid Telegram init data hash.");
  }

  const params = new URLSearchParams(initData);
  const rawUser = params.get("user");

  if (!rawUser) {
    throw new Error("Missing Telegram user payload.");
  }

  const user = JSON.parse(rawUser) as TelegramUser;
  return mapTelegramUser(user);
}
