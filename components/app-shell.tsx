"use client";

import { useEffect, useState } from "react";
import { CardsTab } from "@/components/cards-tab";
import { RanksTab } from "@/components/ranks-tab";
import { TasksTab } from "@/components/tasks-tab";
import { readTelegramWebAppContext } from "@/lib/telegram-webapp";
import { AuthenticatedAppUser } from "@/types/telegram";
import { listDevUsers } from "@/lib/dev-user";

const tabs = [
  { id: "cards", label: "Cards", copy: "Upload a card and browse the newest submissions." },
  { id: "tasks", label: "Tasks", copy: "Claim the daily check-in, track your streak, and share your referral link." },
  { id: "ranks", label: "Ranks", copy: "Leaderboard ranks users by XP from votes received." },
  { id: "profile", label: "Profile", copy: "Profile will show Telegram identity and stats later." },
] as const;

type TabId = (typeof tabs)[number]["id"];

export function AppShell() {
  const [activeTab, setActiveTab] = useState<TabId>("cards");
  const [initData, setInitData] = useState("");
  const [devUser, setDevUser] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [user, setUser] = useState<AuthenticatedAppUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Authenticating...");
  const availableDevUsers = listDevUsers();

  useEffect(() => {
    const telegramContext = readTelegramWebAppContext();
    const webApp = window.Telegram?.WebApp;
    webApp?.ready();
    webApp?.expand();
    setInitData(telegramContext.initData);
    const params = new URLSearchParams(window.location.search);
    const queryDevUser = params.get("devUser") || "";
    const queryReferralCode = params.get("ref") || telegramContext.startParam || "";
    const storedDevUser = window.localStorage.getItem("yop-dev-user") || "";
    const nextDevUser = queryDevUser || storedDevUser;

    if (queryDevUser) {
      window.localStorage.setItem("yop-dev-user", queryDevUser);
    }

    setDevUser(nextDevUser);
    setReferralCode(queryReferralCode);

    async function authenticate(currentDevUser: string, currentReferralCode: string) {
      try {
        const response = await fetch("/api/auth/telegram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            initData: telegramContext.initData,
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
          payload.user.authSource === "dev"
            ? "Development fallback active"
            : "Connected to Telegram",
        );
      } catch (caughtError) {
        const message =
          caughtError instanceof Error ? caughtError.message : "Unable to authenticate.";
        setError(message);
        setStatus("Authentication failed");
      }
    }

    void authenticate(nextDevUser, queryReferralCode);
  }, []);

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
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateRows: "auto 1fr auto",
        padding: "20px 16px 24px",
      }}
    >
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 1,
          marginBottom: 16,
          border: "1px solid var(--border)",
          borderRadius: 20,
          padding: 16,
          background: "rgba(42, 34, 29, 0.88)",
          backdropFilter: "blur(12px)",
          boxShadow: "0 18px 40px var(--shadow)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase" }}>
              $YOP Ponyta King
            </div>
            <h1 style={{ margin: "6px 0 0", fontSize: 24 }}>MVP Shell</h1>
          </div>
          <div
            style={{
              borderRadius: 999,
              padding: "8px 12px",
              background: "var(--accent-soft)",
              color: "var(--accent)",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {status}
          </div>
        </div>

        <div
          style={{
            marginTop: 16,
            display: "grid",
            gap: 10,
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          }}
        >
          <InfoTile label="Display Name" value={user?.displayName || "Waiting for auth"} />
          <InfoTile label="Username" value={user?.username ? `@${user.username}` : "Unavailable"} />
          <InfoTile label="Language" value={user?.language === "ja" ? "Japanese" : "English"} />
          <InfoTile label="Source" value={user?.authSource || "Unknown"} />
        </div>

        {error ? (
          <p style={{ margin: "12px 0 0", color: "#ffb4ab" }}>
            {error}
          </p>
        ) : null}

        {user?.authSource === "dev" ? (
          <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>Dev user</span>
            <select
              value={devUser}
              onChange={(event) => handleDevUserChange(event.target.value)}
              style={{
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "rgba(20, 15, 13, 0.8)",
                color: "var(--text)",
                padding: "8px 10px",
              }}
            >
              <option value="">Default</option>
              {availableDevUsers.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </header>

      <section
        style={{
          border: "1px solid var(--border)",
          borderRadius: 24,
          padding: 20,
          background: "linear-gradient(180deg, rgba(52, 41, 35, 0.96) 0%, rgba(24, 18, 15, 0.98) 100%)",
          boxShadow: "0 24px 60px var(--shadow)",
        }}
      >
        <p style={{ marginTop: 0, color: "var(--text-muted)" }}>Current tab</p>
        <h2 style={{ marginTop: 0, fontSize: 28 }}>{currentTab.label}</h2>
        <p style={{ lineHeight: 1.6, color: "var(--text-muted)" }}>{currentTab.copy}</p>
        {activeTab === "cards" ? (
          <CardsTab initData={initData} devUser={devUser} user={user} />
        ) : activeTab === "tasks" ? (
          <TasksTab initData={initData} devUser={devUser} referralCode={referralCode} user={user} />
        ) : activeTab === "ranks" ? (
          <RanksTab devUser={devUser} user={user} />
        ) : (
          <div
            style={{
              marginTop: 20,
              borderRadius: 18,
              padding: 16,
              border: "1px dashed var(--border)",
              background: "rgba(255, 255, 255, 0.02)",
            }}
          >
            <p style={{ margin: 0, lineHeight: 1.6 }}>
              This tab is intentionally deferred outside the current phase.
            </p>
          </div>
        )}
      </section>

      <nav
        aria-label="Bottom navigation"
        style={{
          position: "sticky",
          bottom: 0,
          marginTop: 18,
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 8,
          border: "1px solid var(--border)",
          borderRadius: 22,
          padding: 8,
          background: "rgba(20, 15, 13, 0.92)",
          backdropFilter: "blur(10px)",
          boxShadow: "0 16px 30px var(--shadow)",
        }}
      >
        {tabs.map((tab) => {
          const active = tab.id === activeTab;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                border: 0,
                borderRadius: 16,
                padding: "12px 10px",
                background: active ? "var(--accent)" : "transparent",
                color: active ? "#1b1612" : "var(--text-muted)",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>
    </main>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        borderRadius: 16,
        padding: 14,
        background: "var(--panel-muted)",
        border: "1px solid var(--border)",
      }}
    >
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>{label}</div>
      <div style={{ fontWeight: 700 }}>{value}</div>
    </div>
  );
}
