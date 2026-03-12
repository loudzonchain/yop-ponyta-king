export type AppLanguage = "en" | "ja";

export type TelegramUser = {
  id: number;
  username?: string;
  first_name: string;
  last_name?: string;
  language_code?: string;
  photo_url?: string;
};

export type AuthenticatedAppUser = {
  telegramId: number;
  username?: string;
  firstName: string;
  lastName?: string;
  displayName: string;
  language: AppLanguage;
  authSource: "telegram" | "dev";
};
