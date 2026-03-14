import { TelegramUser } from "@/types/telegram";

export type TelegramWebAppContext = {
  initData: string;
  user?: TelegramUser;
  startParam?: string;
  isAvailable: boolean;
};

type TelegramWebApp = {
  ready: () => void;
  expand: () => void;
  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
  };
  initData?: string;
  initDataUnsafe?: {
    user?: TelegramUser;
    start_param?: string;
  };
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

export function getTelegramWebApp(): TelegramWebApp | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.Telegram?.WebApp;
}

export function triggerLightImpact() {
  if (typeof window === "undefined") {
    return;
  }

  window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("light");
}

export function readTelegramWebAppContext(): TelegramWebAppContext {
  const webApp = getTelegramWebApp();

  return {
    initData: webApp?.initData || "",
    user: webApp?.initDataUnsafe?.user,
    startParam: webApp?.initDataUnsafe?.start_param,
    isAvailable: Boolean(webApp),
  };
}
