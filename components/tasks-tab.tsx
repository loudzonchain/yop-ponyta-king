"use client";

import { useEffect, useMemo, useState } from "react";
import { listDevUsers } from "@/lib/dev-user";
import { copy } from "@/lib/i18n";
import type { AppLanguage, AuthenticatedAppUser } from "@/types/telegram";
import { TaskSummary } from "@/types/tasks";

type TasksTabProps = {
  initData: string;
  devUser: string;
  referralCode: string;
  user: AuthenticatedAppUser | null;
  language: AppLanguage;
};

type SummaryResponse = {
  summary?: TaskSummary;
  error?: string;
};

type CheckInResponse = {
  currentStreak?: number;
  checkedInToday?: boolean;
  xp?: number;
  error?: string;
};

export function TasksTab({ initData, devUser, referralCode, user, language }: TasksTabProps) {
  const [summary, setSummary] = useState<TaskSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const text = copy[language];
  const localDevReferralLinks = useMemo(() => {
    if (!summary?.referralLink) {
      return [];
    }

    return listDevUsers()
      .filter((candidate) => candidate !== devUser)
      .map((candidate) => ({
        devUser: candidate,
        link: `${summary.referralLink}&devUser=${candidate}`,
      }));
  }, [devUser, summary?.referralLink]);

  useEffect(() => {
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
        const payload = (await response.json()) as SummaryResponse;

        if (!response.ok || !payload.summary) {
          throw new Error(payload.error || text.loadTasksError);
        }

        setSummary(payload.summary);
      } catch (caughtError) {
        const message = caughtError instanceof Error ? caughtError.message : text.loadTasksError;
        setError(message);
      } finally {
        setIsLoading(false);
      }
    }

    void loadSummary();
  }, [devUser, initData, referralCode, text.loadTasksError]);

  async function handleCheckIn() {
    if (!user) {
      setError(text.authenticateBeforeCheckIn);
      return;
    }

    setError(null);
    setSuccess(null);
    setIsCheckingIn(true);

    try {
      const response = await fetch("/api/tasks/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, devUser, referralCode }),
      });
      const payload = (await response.json()) as CheckInResponse;

      if (!response.ok || payload.currentStreak === undefined || payload.xp === undefined) {
        throw new Error(payload.error || text.checkInError);
      }

      setSummary((currentSummary) =>
        currentSummary
          ? {
              ...currentSummary,
              currentStreak: payload.currentStreak!,
              checkedInToday: true,
              xp: payload.xp!,
            }
          : currentSummary,
      );
      setSuccess(text.dailyCheckInClaimed);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : text.checkInError;
      setError(message);
    } finally {
      setIsCheckingIn(false);
    }
  }

  async function copyReferralLink() {
    if (!summary?.referralLink) {
      return;
    }

    try {
      await navigator.clipboard.writeText(summary.referralLink);
      setSuccess(text.referralLinkCopied);
    } catch {
      setError(text.copyReferralLinkError);
    }
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div
        style={{
          borderRadius: 18,
          padding: 16,
          background: "var(--panel-muted)",
          border: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <StatCard label={text.currentStreak} value={summary ? text.currentStreakValue(summary.currentStreak) : "..."} />
          <StatCard label={text.checkInStatus} value={summary?.checkedInToday ? text.checkedInDone : text.checkedInOpen} />
          <StatCard label={text.referralCount} value={summary ? String(summary.referralCount) : "..."} />
          <StatCard label={text.xp} value={summary ? `${summary.xp}` : "..."} />
        </div>

        <button
          type="button"
          onClick={() => void handleCheckIn()}
          disabled={isCheckingIn || !user || summary?.checkedInToday}
          style={{
            marginTop: 16,
            border: 0,
            borderRadius: 14,
            padding: "14px 16px",
            fontWeight: 700,
            cursor: isCheckingIn || !user || summary?.checkedInToday ? "not-allowed" : "pointer",
            background:
              isCheckingIn || !user || summary?.checkedInToday ? "rgba(255,255,255,0.12)" : "var(--accent)",
            color: isCheckingIn || !user || summary?.checkedInToday ? "var(--text-muted)" : "#1b1612",
          }}
        >
          {summary?.checkedInToday ? text.checkedInToday : isCheckingIn ? text.checkingIn : text.claimDailyCheckIn}
        </button>
      </div>

      <div
        style={{
          borderRadius: 18,
          padding: 16,
          background: "rgba(42, 34, 29, 0.86)",
          border: "1px solid var(--border)",
        }}
      >
        <h3 style={{ marginTop: 0 }}>{text.referralLink}</h3>
        <p style={{ color: "var(--text-muted)", lineHeight: 1.6 }}>
          {text.referralDescription}
        </p>
        <input
          readOnly
          value={summary?.referralLink || ""}
          style={{
            width: "100%",
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "rgba(20, 15, 13, 0.8)",
            color: "var(--text)",
            padding: "12px 14px",
          }}
        />
        <button
          type="button"
          onClick={() => void copyReferralLink()}
          disabled={!summary?.referralLink}
          style={{
            marginTop: 12,
            border: 0,
            borderRadius: 12,
            padding: "10px 12px",
            fontWeight: 700,
            cursor: summary?.referralLink ? "pointer" : "not-allowed",
            background: "rgba(255,255,255,0.08)",
            color: "var(--text)",
          }}
        >
          {text.copyLink}
        </button>

        {user?.authSource === "dev" ? (
          <p style={{ marginBottom: 0, color: "var(--text-muted)", fontSize: 12 }}>
            {text.localDevHint}
          </p>
        ) : null}

        {user?.authSource === "dev" && localDevReferralLinks.length > 0 ? (
          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            {localDevReferralLinks.map((entry) => (
              <div
                key={entry.devUser}
                style={{
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "rgba(20, 15, 13, 0.55)",
                  padding: "10px 12px",
                }}
              >
                <div style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 4 }}>
                  {text.openAsDevUser(entry.devUser)}
                </div>
                <code style={{ wordBreak: "break-all" }}>{entry.link}</code>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {isLoading ? <p style={{ color: "var(--text-muted)" }}>{text.loadingTasks}</p> : null}
      {error ? <p style={{ color: "#ffb4ab" }}>{error}</p> : null}
      {success ? <p style={{ color: "#8fe388" }}>{success}</p> : null}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        borderRadius: 14,
        padding: 14,
        border: "1px solid var(--border)",
        background: "rgba(20, 15, 13, 0.55)",
      }}
    >
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>{label}</div>
      <div style={{ fontWeight: 700 }}>{value}</div>
    </div>
  );
}
