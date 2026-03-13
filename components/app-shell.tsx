"use client";

import { useEffect, useMemo, useState } from "react";
import { CardsTab } from "@/components/cards-tab";
import { RanksTab } from "@/components/ranks-tab";
import { TasksTab } from "@/components/tasks-tab";
import { getTelegramWebApp, readTelegramWebAppContext } from "@/lib/telegram-webapp";
import { AuthenticatedAppUser, AppLanguage } from "@/types/telegram";
import { listDevUsers } from "@/lib/dev-user";
import { TaskSummary } from "@/types/tasks";

type TabId = "cards" | "tasks" | "ranks" | "profile";
type ShellText = (typeof copy)["en"] | (typeof copy)["ja"];

const copy = {
  en: {
    title: "$YOP Ponyta King",
    subtitle: "Ponyta Ranch-inspired Telegram adventure",
    statusTelegram: "Connected to Telegram",
    statusDev: "Development fallback active",
    displayName: "Display Name",
    username: "Username",
    source: "Source",
    language: "Language",
    streak: "Streak",
    xp: "XP",
    cards: "Cards",
    tasks: "Tasks",
    ranks: "Ranks",
    profile: "Profile",
    cardsCopy: "Share meme cards with the ranch, then vote on the freshest uploads.",
    tasksCopy: "Keep your daily streak alive and track referral progress.",
    ranksCopy: "See where you stand in the Ponyta King leaderboard.",
    profileCopy: "Your Telegram identity, streak, XP, and growth stats live here.",
    waiting: "Waiting for auth",
    unavailable: "Unavailable",
    profileStats: "Profile Stats",
    referralCount: "Referrals",
    checkedIn: "Check-in",
    checkedInDone: "Done today",
    checkedInOpen: "Available",
    sourceTelegram: "telegram",
    sourceDev: "dev",
    sourceUnknown: "Unknown",
    languageToggle: "Language",
    devUser: "Dev user",
  },
  ja: {
    title: "$YOP Ponyta King",
    subtitle: "ポニータ牧場風のTelegramミニアプリ",
    statusTelegram: "Telegram接続中",
    statusDev: "開発フォールバック中",
    displayName: "表示名",
    username: "ユーザー名",
    source: "認証元",
    language: "言語",
    streak: "連続日数",
    xp: "XP",
    cards: "カード",
    tasks: "タスク",
    ranks: "ランキング",
    profile: "プロフィール",
    cardsCopy: "ミームカードを投稿して、新しいカードに投票しましょう。",
    tasksCopy: "毎日の連続記録を守り、紹介状況を確認しましょう。",
    ranksCopy: "Ponyta Kingランキングで自分の順位を確認できます。",
    profileCopy: "Telegram情報、連続記録、XP、紹介数をまとめて表示します。",
    waiting: "認証待ち",
    unavailable: "未設定",
    profileStats: "プロフィール統計",
    referralCount: "紹介人数",
    checkedIn: "今日のチェックイン",
    checkedInDone: "完了",
    checkedInOpen: "可能",
    sourceTelegram: "telegram",
    sourceDev: "dev",
    sourceUnknown: "不明",
    languageToggle: "言語",
    devUser: "開発ユーザー",
  },
} as const;

const tabIcons: Record<TabId, string> = {
  cards: "▦",
  tasks: "✦",
  ranks: "♛",
  profile: "◉",
};

export function AppShell() {
  const [activeTab, setActiveTab] = useState<TabId>("cards");
  const [initData, setInitData] = useState("");
  const [devUser, setDevUser] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [user, setUser] = useState<AuthenticatedAppUser | null>(null);
  const [summary, setSummary] = useState<TaskSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Authenticating...");
  const [isUpdatingLanguage, setIsUpdatingLanguage] = useState(false);
  const availableDevUsers = listDevUsers();
  const language = user?.language || "en";
  const text = copy[language];

  const tabs = useMemo(
    () => [
      { id: "cards" as const, label: text.cards, copy: text.cardsCopy },
      { id: "tasks" as const, label: text.tasks, copy: text.tasksCopy },
      { id: "ranks" as const, label: text.ranks, copy: text.ranksCopy },
      { id: "profile" as const, label: text.profile, copy: text.profileCopy },
    ],
    [text.cards, text.cardsCopy, text.profile, text.profileCopy, text.ranks, text.ranksCopy, text.tasks, text.tasksCopy],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryDevUser = params.get("devUser") || "";
    const storedDevUser = window.localStorage.getItem("yop-dev-user") || "";
    const nextDevUser = queryDevUser || storedDevUser;
    const requestedTab = params.get("tab");

    if (
      requestedTab === "cards" ||
      requestedTab === "tasks" ||
      requestedTab === "ranks" ||
      requestedTab === "profile"
    ) {
      setActiveTab(requestedTab);
    }

    if (queryDevUser) {
      window.localStorage.setItem("yop-dev-user", queryDevUser);
    }

    setDevUser(nextDevUser);

    async function authenticate(
      currentInitData: string,
      currentDevUser: string,
      currentReferralCode: string,
    ) {
      try {
        const response = await fetch("/api/auth/telegram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            initData: currentInitData,
            devUser: currentDevUser,
            referralCode: currentReferralCode,
          }),
        });

        const payload = (await response.json()) as {
          user?: AuthenticatedAppUser;
          error?: string;
        };

        if (!response.ok || !payload.user) {
          throw new Error(payload.error || "Unable to authenticate.");
        }

        setUser(payload.user);
        setStatus(
          payload.user.authSource === "dev" ? copy[payload.user.language].statusDev : copy[payload.user.language].statusTelegram,
        );
      } catch (caughtError) {
        const message =
          caughtError instanceof Error ? caughtError.message : "Unable to authenticate.";
        setError(message);
        setStatus("Authentication failed");
      }
    }

    function bootstrapAuth(attempt = 0) {
      const webApp = getTelegramWebApp();
      webApp?.ready();
      webApp?.expand();

      const telegramContext = readTelegramWebAppContext();
      const nextReferralCode = params.get("ref") || telegramContext.startParam || "";

      setInitData(telegramContext.initData);
      setReferralCode(nextReferralCode);

      if (telegramContext.isAvailable && !telegramContext.initData && attempt < 10) {
        window.setTimeout(() => bootstrapAuth(attempt + 1), 150);
        return;
      }

      void authenticate(telegramContext.initData, nextDevUser, nextReferralCode);
    }

    bootstrapAuth();
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    async function loadSummary() {
      try {
        const response = await fetch("/api/tasks/summary", {
          cache: "no-store",
          headers: {
            "x-telegram-init-data": initData,
            "x-dev-user": devUser,
            "x-referral-code": referralCode,
          },
        });

        const payload = (await response.json()) as { summary?: TaskSummary };

        if (payload.summary) {
          setSummary(payload.summary);
        }
      } catch {
        // Keep the shell resilient even if the summary endpoint is unavailable.
      }
    }

    void loadSummary();
  }, [devUser, initData, referralCode, user]);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", activeTab);
    window.history.replaceState({}, "", url.toString());
  }, [activeTab]);

  async function handleLanguageChange(nextLanguage: AppLanguage) {
    if (!user || nextLanguage === user.language) {
      return;
    }

    setIsUpdatingLanguage(true);

    try {
      const response = await fetch("/api/me/language", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initData,
          devUser,
          language: nextLanguage,
        }),
      });
      const payload = (await response.json()) as {
        user?: AuthenticatedAppUser;
        error?: string;
      };

      if (!response.ok || !payload.user) {
        throw new Error(payload.error || "Unable to update language.");
      }

      setUser(payload.user);
      setStatus(payload.user.authSource === "dev" ? copy[payload.user.language].statusDev : copy[payload.user.language].statusTelegram);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to update language.");
    } finally {
      setIsUpdatingLanguage(false);
    }
  }

  function handleDevUserChange(nextDevUser: string) {
    window.localStorage.setItem("yop-dev-user", nextDevUser);
    const url = new URL(window.location.href);

    if (nextDevUser) {
      url.searchParams.set("devUser", nextDevUser);
    } else {
      url.searchParams.delete("devUser");
    }

    window.location.href = url.toString();
  }

  const currentTab = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  return (
    <main className="app-shell">
      <header className="ranch-panel ranch-hero">
        <div className="hero-topline">PONYTA RANCH // TELEGRAM MINI APP</div>
        <div className="hero-row">
          <div>
            <h1 className="hero-title">{text.title}</h1>
            <p className="hero-subtitle">{text.subtitle}</p>
          </div>
          <div className="status-pill">{status}</div>
        </div>

        <div className="hero-metrics">
          <MetricBadge label={text.streak} value={`${summary?.currentStreak ?? 0}`} />
          <MetricBadge label={text.xp} value={`${summary?.xp ?? 0}`} />
        </div>

        <div className="shell-toolbar">
          <div className="language-toggle">
            <span>{text.languageToggle}</span>
            <button type="button" onClick={() => void handleLanguageChange("en")} disabled={isUpdatingLanguage || language === "en"} className={language === "en" ? "toggle-active" : ""}>
              EN
            </button>
            <button type="button" onClick={() => void handleLanguageChange("ja")} disabled={isUpdatingLanguage || language === "ja"} className={language === "ja" ? "toggle-active" : ""}>
              JP
            </button>
          </div>

          {user?.authSource === "dev" ? (
            <label className="dev-switcher">
              <span>{text.devUser}</span>
              <select value={devUser} onChange={(event) => handleDevUserChange(event.target.value)}>
                <option value="">Default</option>
                {availableDevUsers.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        <div className="identity-grid">
          <InfoTile label={text.displayName} value={user?.displayName || text.waiting} />
          <InfoTile label={text.username} value={user?.username ? `@${user.username}` : text.unavailable} />
          <InfoTile label={text.language} value={language === "ja" ? "Japanese" : "English"} />
          <InfoTile label={text.source} value={user?.authSource || text.sourceUnknown} />
        </div>

        {error ? <p className="error-text">{error}</p> : null}
      </header>

      <section className="ranch-panel tab-panel">
        <div className="tab-header">
          <p className="tab-eyebrow">{tabIcons[activeTab]} {currentTab.label}</p>
          <h2>{currentTab.label}</h2>
          <p>{currentTab.copy}</p>
        </div>

        {activeTab === "cards" ? (
          <CardsTab initData={initData} devUser={devUser} user={user} />
        ) : activeTab === "tasks" ? (
          <TasksTab initData={initData} devUser={devUser} referralCode={referralCode} user={user} />
        ) : activeTab === "ranks" ? (
          <RanksTab devUser={devUser} user={user} />
        ) : (
          <ProfilePanel
            text={text}
            user={user}
            summary={summary}
          />
        )}
      </section>

      <nav aria-label="Bottom navigation" className="bottom-nav">
        {tabs.map((tab) => {
          const active = tab.id === activeTab;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={active ? "nav-active" : ""}
            >
              <span>{tabIcons[tab.id]}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </main>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-tile">
      <div className="info-label">{label}</div>
      <div className="info-value">{value}</div>
    </div>
  );
}

function MetricBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-badge">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ProfilePanel({
  text,
  user,
  summary,
}: {
  text: ShellText;
  user: AuthenticatedAppUser | null;
  summary: TaskSummary | null;
}) {
  return (
    <div className="profile-grid">
      <div className="profile-hero">
        <div className="profile-avatar">{user?.firstName?.slice(0, 1) || "?"}</div>
        <div>
          <h3>{user?.displayName || text.waiting}</h3>
          <p>{user?.username ? `@${user.username}` : text.unavailable}</p>
        </div>
      </div>

      <div className="profile-stats">
        <InfoTile label={text.xp} value={`${summary?.xp ?? 0}`} />
        <InfoTile label={text.streak} value={`${summary?.currentStreak ?? 0}`} />
        <InfoTile label={text.referralCount} value={`${summary?.referralCount ?? 0}`} />
        <InfoTile
          label={text.checkedIn}
          value={summary?.checkedInToday ? text.checkedInDone : text.checkedInOpen}
        />
      </div>
    </div>
  );
}
