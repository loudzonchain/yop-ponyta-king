import { AuthenticatedAppUser } from "@/types/telegram";

const DEV_USER_PRESETS: Record<string, Omit<AuthenticatedAppUser, "authSource" | "language">> = {
  alice: {
    telegramId: 100001,
    username: "alice_ponyta",
    firstName: "Alice",
    lastName: "Ponyta",
    displayName: "Alice Ponyta",
  },
  bob: {
    telegramId: 100002,
    username: "bob_ponyta",
    firstName: "Bob",
    lastName: "Ponyta",
    displayName: "Bob Ponyta",
  },
  charlie: {
    telegramId: 100003,
    username: "charlie_ponyta",
    firstName: "Charlie",
    lastName: "Ponyta",
    displayName: "Charlie Ponyta",
  },
};

export function getDevUser(devUser?: string): AuthenticatedAppUser {
  const preset = devUser ? DEV_USER_PRESETS[devUser] : undefined;

  if (preset) {
    return {
      ...preset,
      language: "en",
      authSource: "dev",
    };
  }

  const firstName = process.env.DEV_TELEGRAM_FIRST_NAME || "Dev";
  const lastName = process.env.DEV_TELEGRAM_LAST_NAME || "User";
  const displayName = [firstName, lastName].filter(Boolean).join(" ");

  return {
    telegramId: Number(process.env.DEV_TELEGRAM_USER_ID || "999999"),
    username: process.env.DEV_TELEGRAM_USERNAME || "dev_ponyta",
    firstName,
    lastName,
    displayName,
    language: "en",
    authSource: "dev",
  };
}

export function listDevUsers() {
  return Object.keys(DEV_USER_PRESETS);
}
