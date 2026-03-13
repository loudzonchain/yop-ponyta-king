import {
  ensureCardSchema,
  getTaskSummary,
  getUserSummaryByTelegramId,
  listLeaderboard,
  updateUserLanguage,
  upsertUser,
} from "@/lib/cards";
import { mapTelegramUser, parseLanguage } from "@/lib/telegram-auth";
import { AppLanguage, TelegramUser } from "@/types/telegram";

type InlineButton =
  | { text: string; web_app: { url: string } }
  | { text: string; url: string }
  | { text: string; callback_data: string };

type TelegramSendMessagePayload = {
  chat_id: number;
  text: string;
  reply_markup?: {
    inline_keyboard: InlineButton[][];
  };
};

export type TelegramUpdate = {
  message?: {
    chat?: { id: number };
    text?: string;
    from?: TelegramUser;
  };
  callback_query?: {
    id: string;
    data?: string;
    from: TelegramUser;
    message?: {
      chat?: { id: number };
    };
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

function getText(language: AppLanguage) {
  if (language === "ja") {
    return {
      chooseLanguage: "言語を選択してください。",
      english: "English",
      japanese: "日本語",
      openMiniApp: "ミニアプリを開く",
      openTasks: "タスクを開く",
      openRanks: "ランキングを開く",
      welcome:
        "ようこそ、$YOP Ponyta Kingへ。カードを投稿し、デイリータスクをこなし、XPランキングを上げましょう。",
      rank: (rank: number, xp: number, streak: number) =>
        `あなたの順位は #${rank} です。\nXP: ${xp}\n連続チェックイン: ${streak}日`,
      tasks: (checkedInToday: boolean, streak: number) =>
        `今日のタスク状況\nデイリーチェックイン: ${checkedInToday ? "完了" : "未完了"}\n現在の連続: ${streak}日`,
      top: "トップ5 リーダーボード",
      noData: "まだデータがありません。",
      languageSaved: "言語設定を保存しました。",
    };
  }

  return {
    chooseLanguage: "Choose your language to start.",
    english: "English",
    japanese: "Japanese",
    openMiniApp: "Open Mini App",
    openTasks: "Open Tasks",
    openRanks: "Open Ranks",
    welcome:
      "Welcome to $YOP Ponyta King. Submit cards, complete daily tasks, and climb the XP leaderboard.",
    rank: (rank: number, xp: number, streak: number) =>
      `Your current rank is #${rank}.\nXP: ${xp}\nStreak: ${streak} day${streak === 1 ? "" : "s"}`,
    tasks: (checkedInToday: boolean, streak: number) =>
      `Today's task status\nDaily check-in: ${checkedInToday ? "Done" : "Available"}\nCurrent streak: ${streak} day${streak === 1 ? "" : "s"}`,
    top: "Top 5 leaderboard",
    noData: "No data yet.",
    languageSaved: "Language saved.",
  };
}

export function buildMiniAppUrl(options?: { startPayload?: string; tab?: string }) {
  const appUrl = new URL(getAppUrl());

  if (options?.startPayload) {
    appUrl.searchParams.set("ref", options.startPayload);
  }

  if (options?.tab) {
    appUrl.searchParams.set("tab", options.tab);
  }

  return appUrl.toString();
}

export function getStartPayload(update: TelegramUpdate) {
  const text = update.message?.text || "";
  const match = text.match(/^\/start(?:@\w+)?(?:\s+(.*))?$/);
  return match?.[1]?.trim() || "";
}

function getMessageCommand(update: TelegramUpdate) {
  const text = update.message?.text || "";
  return text.split(" ")[0]?.toLowerCase() || "";
}

function buildLanguageKeyboard(startPayload?: string) {
  return {
    inline_keyboard: [
      [
        { text: "English", callback_data: `lang:en:${startPayload || "-"}` },
        { text: "日本語", callback_data: `lang:ja:${startPayload || "-"}` },
      ],
    ],
  };
}

async function telegramApi(method: string, payload: object) {
  const token = getBotToken();
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram ${method} failed: ${body}`);
  }
}

export async function sendTelegramMessage(payload: TelegramSendMessagePayload) {
  await telegramApi("sendMessage", payload);
}

async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  await telegramApi("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
  });
}

async function ensureBotUser(telegramUser: TelegramUser, language?: AppLanguage) {
  const appUser = mapTelegramUser({
    ...telegramUser,
    language_code: language || telegramUser.language_code,
  });

  await ensureCardSchema();
  await upsertUser(appUser);

  if (language) {
    await updateUserLanguage(appUser.telegramId, language);
  }

  const storedUser = await getUserSummaryByTelegramId(appUser.telegramId);

  return {
    ...appUser,
    language: storedUser?.language || language || appUser.language,
  };
}

async function sendWelcomeMessage(chatId: number, language: AppLanguage, startPayload?: string) {
  const text = getText(language);

  await sendTelegramMessage({
    chat_id: chatId,
    text: text.welcome,
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: text.openMiniApp,
            web_app: { url: buildMiniAppUrl({ startPayload }) },
          },
        ],
      ],
    },
  });
}

export async function handleTelegramStart(update: TelegramUpdate) {
  const chatId = update.message?.chat?.id;
  const fromUser = update.message?.from;

  if (!chatId || !fromUser) {
    return;
  }

  const existingUser = await getUserSummaryByTelegramId(fromUser.id);

  if (existingUser?.language) {
    await ensureBotUser(fromUser);
    await sendWelcomeMessage(chatId, existingUser.language, getStartPayload(update) || undefined);
    return;
  }

  await sendTelegramMessage({
    chat_id: chatId,
    text: getText(parseLanguage(fromUser.language_code)).chooseLanguage,
    reply_markup: buildLanguageKeyboard(getStartPayload(update) || undefined),
  });
}

export async function handleTelegramLanguageSelection(update: TelegramUpdate) {
  const callbackQuery = update.callback_query;
  const callbackData = callbackQuery?.data;
  const chatId = callbackQuery?.message?.chat?.id;

  if (!callbackQuery || !callbackData || !chatId) {
    return;
  }

  const [, rawLanguage, rawStartPayload] = callbackData.split(":");
  const language = parseLanguage(rawLanguage);
  const startPayload = rawStartPayload && rawStartPayload !== "-" ? rawStartPayload : undefined;
  const text = getText(language);

  await ensureBotUser(callbackQuery.from, language);
  await answerCallbackQuery(callbackQuery.id, text.languageSaved);
  await sendWelcomeMessage(chatId, language, startPayload);
}

export async function handleTelegramRank(update: TelegramUpdate) {
  const chatId = update.message?.chat?.id;
  const fromUser = update.message?.from;

  if (!chatId || !fromUser) {
    return;
  }

  const user = await ensureBotUser(fromUser);
  const summary = await getUserSummaryByTelegramId(user.telegramId);
  const text = getText(user.language);

  await sendTelegramMessage({
    chat_id: chatId,
    text: summary
      ? text.rank(summary.rank, summary.xp, summary.currentStreak)
      : text.noData,
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: text.openRanks,
            web_app: { url: buildMiniAppUrl({ tab: "ranks" }) },
          },
        ],
      ],
    },
  });
}

export async function handleTelegramTasks(update: TelegramUpdate) {
  const chatId = update.message?.chat?.id;
  const fromUser = update.message?.from;

  if (!chatId || !fromUser) {
    return;
  }

  const user = await ensureBotUser(fromUser);
  const summary = await getTaskSummary(user, getAppUrl());
  const text = getText(user.language);

  await sendTelegramMessage({
    chat_id: chatId,
    text: text.tasks(summary.checkedInToday, summary.currentStreak),
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: text.openTasks,
            web_app: { url: buildMiniAppUrl({ tab: "tasks" }) },
          },
        ],
      ],
    },
  });
}

export async function handleTelegramTop(update: TelegramUpdate) {
  const chatId = update.message?.chat?.id;
  const fromUser = update.message?.from;

  if (!chatId || !fromUser) {
    return;
  }

  const user = await ensureBotUser(fromUser);
  const leaders = await listLeaderboard(5);
  const text = getText(user.language);
  const lines = leaders.length
    ? leaders.map((entry) => `#${entry.rank} ${entry.displayName} — ${entry.xp} XP`)
    : [text.noData];

  await sendTelegramMessage({
    chat_id: chatId,
    text: `${text.top}\n\n${lines.join("\n")}`,
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: text.openRanks,
            web_app: { url: buildMiniAppUrl({ tab: "ranks" }) },
          },
        ],
      ],
    },
  });
}

export function getUpdateCommand(update: TelegramUpdate) {
  if (update.callback_query?.data?.startsWith("lang:")) {
    return "language";
  }

  const command = getMessageCommand(update);

  if (command.startsWith("/start")) {
    return "start";
  }

  if (command.startsWith("/rank")) {
    return "rank";
  }

  if (command.startsWith("/tasks")) {
    return "tasks";
  }

  if (command.startsWith("/top")) {
    return "top";
  }

  return null;
}
