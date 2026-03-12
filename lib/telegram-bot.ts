type TelegramSendMessagePayload = {
  chat_id: number;
  text: string;
  reply_markup?: {
    inline_keyboard: Array<
      Array<
        | { text: string; web_app: { url: string } }
        | { text: string; url: string }
      >
    >;
  };
};

type TelegramUpdate = {
  message?: {
    chat?: { id: number };
    text?: string;
  };
};

function getBotToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN.");
  }

  return token;
}

function getAppUrl() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!appUrl) {
    throw new Error("Missing NEXT_PUBLIC_APP_URL.");
  }

  return appUrl;
}

export function buildMiniAppUrl(startPayload?: string) {
  const appUrl = new URL(getAppUrl());

  if (startPayload) {
    appUrl.searchParams.set("ref", startPayload);
  }

  return appUrl.toString();
}

export function getStartPayload(update: TelegramUpdate) {
  const text = update.message?.text || "";

  if (!text.startsWith("/start")) {
    return "";
  }

  return text.replace("/start", "").trim();
}

export async function sendTelegramMessage(payload: TelegramSendMessagePayload) {
  const token = getBotToken();
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram sendMessage failed: ${body}`);
  }
}

export async function handleTelegramStart(update: TelegramUpdate) {
  const chatId = update.message?.chat?.id;

  if (!chatId) {
    return;
  }

  const startPayload = getStartPayload(update);
  const miniAppUrl = buildMiniAppUrl(startPayload || undefined);

  await sendTelegramMessage({
    chat_id: chatId,
    text: "Open $YOP Ponyta King to upload cards, check in, and compete on the leaderboard.",
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Open Mini App",
            web_app: { url: miniAppUrl },
          },
        ],
      ],
    },
  });
}
