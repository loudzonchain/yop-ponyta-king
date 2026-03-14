"use client";

import { useEffect, useMemo, useState } from "react";
import { listDevUsers } from "@/lib/dev-user";
import { copy } from "@/lib/i18n";
import type { AppLanguage, AuthenticatedAppUser } from "@/types/telegram";
import { TaskSummary, TaskType } from "@/types/tasks";

type TasksTabProps = {
  initData: string;
  devUser: string;
  referralCode: string;
  user: AuthenticatedAppUser | null;
  language: AppLanguage;
  onSummaryChange?: (summary: TaskSummary) => void;
};

type SummaryResponse = {
  summary?: TaskSummary;
  error?: string;
};

export function TasksTab({
  initData,
  devUser,
  referralCode,
  user,
  language,
  onSummaryChange,
}: TasksTabProps) {
  const [summary, setSummary] = useState<TaskSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [claimingTaskType, setClaimingTaskType] = useState<TaskType | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const text = copy[language];

  const taskContent = {
    daily_check_in: {
      title: text.dailyCheckInTitle,
      description: text.dailyCheckInDescription,
      buttonLabel: text.claimDailyCheckIn,
    },
    submit_card: {
      title: text.submitCardTaskTitle,
      description: text.submitCardTaskDescription,
      buttonLabel: null,
    },
    vote_on_3_cards: {
      title: text.voteOnThreeCardsTaskTitle,
      description: text.voteOnThreeCardsTaskDescription,
      buttonLabel: null,
    },
    invite_friend: {
      title: text.inviteFriendTaskTitle,
      description: text.inviteFriendTaskDescription,
      buttonLabel: null,
    },
    share_on_x_twitter: {
      title: text.shareOnXTaskTitle,
      description: text.shareOnXTaskDescription,
      buttonLabel: text.claimTask,
    },
    join_group_chat: {
      title: text.joinGroupChatTaskTitle,
      description: text.joinGroupChatTaskDescription,
      buttonLabel: text.claimTask,
    },
  } satisfies Record<TaskType, { title: string; description: string; buttonLabel: string | null }>;

  const checkInTask = summary?.tasks.find((task) => task.taskType === "daily_check_in");

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
    const timer = window.setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    async function loadSummary() {
      setIsLoading(true);

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
        onSummaryChange?.(payload.summary);
      } catch (caughtError) {
        const message = caughtError instanceof Error ? caughtError.message : text.loadTasksError;
        setError(message);
      } finally {
        setIsLoading(false);
      }
    }

    void loadSummary();
  }, [devUser, initData, onSummaryChange, referralCode, text.loadTasksError]);

  async function handleCheckIn() {
    if (!user) {
      setError(text.authenticateBeforeCheckIn);
      return;
    }

    setError(null);
    setSuccess(null);
    setClaimingTaskType("daily_check_in");

    try {
      const response = await fetch("/api/tasks/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, devUser, referralCode }),
      });
      const payload = (await response.json()) as SummaryResponse;

      if (!response.ok || !payload.summary) {
        throw new Error(payload.error || text.checkInError);
      }

      setSummary(payload.summary);
      onSummaryChange?.(payload.summary);
      setSuccess(text.dailyCheckInClaimed);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : text.checkInError;
      setError(message);
    } finally {
      setClaimingTaskType(null);
    }
  }

  async function handleManualClaim(taskType: TaskType) {
    if (!user) {
      setError(text.authenticateBeforeCheckIn);
      return;
    }

    setError(null);
    setSuccess(null);
    setClaimingTaskType(taskType);

    try {
      const response = await fetch("/api/tasks/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, devUser, referralCode, taskType }),
      });
      const payload = (await response.json()) as SummaryResponse;

      if (!response.ok || !payload.summary) {
        throw new Error(payload.error || text.loadTasksError);
      }

      setSummary(payload.summary);
      onSummaryChange?.(payload.summary);
      setSuccess(text.manualTaskClaimed);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : text.loadTasksError;
      setError(message);
    } finally {
      setClaimingTaskType(null);
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
        <div
          style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}
        >
          <StatCard
            label={text.currentStreak}
            value={summary ? text.currentStreakValue(summary.currentStreak) : "..."}
          />
          <StatCard
            label={text.checkInStatus}
            value={checkInTask?.claimed ? text.checkedInDone : text.checkedInOpen}
          />
          <StatCard
            label={text.referralCount}
            value={summary ? String(summary.referralCount) : "..."}
          />
          <StatCard label={text.xp} value={summary ? `${summary.xp}` : "..."} />
        </div>
      </div>

      <div
        style={{
          borderRadius: 18,
          padding: 16,
          background: "rgba(42, 34, 29, 0.86)",
          border: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "grid", gap: 4 }}>
          <h3 style={{ margin: 0 }}>{text.allTasks}</h3>
          <p style={{ margin: 0, color: "var(--text-muted)", lineHeight: 1.6 }}>{text.tasksIntro}</p>
        </div>

        <div
          style={{
            marginTop: 16,
            display: "grid",
            gap: 14,
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          }}
        >
          {summary?.tasks.map((task) => {
            const content = taskContent[task.taskType];
            const remainingMs = getRemainingMs(task.availableAt, currentTime, task.cooldownRemainingMs);
            const showCooldown = task.claimed && task.availableAt && remainingMs > 0;
            const canClaimManually = Boolean(
              task.manualClaim && !task.claimed && user && claimingTaskType === null,
            );
            const isClaiming = claimingTaskType === task.taskType;
            const isCheckInTask = task.taskType === "daily_check_in";

            return (
              <article
                key={task.taskType}
                style={{
                  borderRadius: 16,
                  padding: 16,
                  border: "1px solid var(--border)",
                  background: "rgba(20, 15, 13, 0.55)",
                  display: "grid",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>{content.title}</div>
                    <p style={{ margin: 0, color: "var(--text-muted)", lineHeight: 1.5 }}>
                      {content.description}
                    </p>
                  </div>
                  <span
                    style={{
                      borderRadius: 999,
                      padding: "6px 10px",
                      background: "rgba(255,255,255,0.08)",
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {text.taskReward(task.xpReward)}
                  </span>
                </div>

                <div style={{ display: "grid", gap: 6, color: "var(--text-muted)", fontSize: 13 }}>
                  <span>{task.claimed ? text.taskCompleted : text.taskAvailable}</span>
                  {task.goal ? <span>{text.taskProgress(task.progress || 0, task.goal)}</span> : null}
                  {showCooldown ? <span>{text.taskCooldown(formatDuration(remainingMs))}</span> : null}
                  {task.cooldownHours === null ? <span>{text.taskLifetime}</span> : null}
                </div>

                {isCheckInTask ? (
                  <button
                    type="button"
                    onClick={() => void handleCheckIn()}
                    disabled={Boolean(claimingTaskType) || !user || task.claimed}
                    style={getTaskButtonStyle(Boolean(claimingTaskType) || !user || task.claimed)}
                  >
                    {task.claimed
                      ? text.checkedInToday
                      : isClaiming
                        ? text.checkingIn
                        : content.buttonLabel}
                  </button>
                ) : content.buttonLabel ? (
                  <button
                    type="button"
                    onClick={() => void handleManualClaim(task.taskType)}
                    disabled={!canClaimManually || isClaiming}
                    style={getTaskButtonStyle(!canClaimManually || isClaiming)}
                  >
                    {isClaiming ? text.claimingTask : content.buttonLabel}
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
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
        <p style={{ color: "var(--text-muted)", lineHeight: 1.6 }}>{text.referralDescription}</p>
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

function getRemainingMs(
  availableAt: string | null,
  currentTime: number,
  fallbackRemainingMs: number | null,
) {
  if (!availableAt) {
    return fallbackRemainingMs || 0;
  }

  return Math.max(0, new Date(availableAt).getTime() - currentTime);
}

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds].map((value) => value.toString().padStart(2, "0")).join(":");
}

function getTaskButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    border: 0,
    borderRadius: 14,
    padding: "14px 16px",
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    background: disabled ? "rgba(255,255,255,0.12)" : "var(--accent)",
    color: disabled ? "var(--text-muted)" : "#1b1612",
  };
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
