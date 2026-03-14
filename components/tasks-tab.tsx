"use client";

import { useEffect, useMemo, useState } from "react";
import { listDevUsers } from "@/lib/dev-user";
import { copy } from "@/lib/i18n";
import { triggerLightImpact } from "@/lib/telegram-webapp";
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

    triggerLightImpact();

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

    triggerLightImpact();

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
    <div className="tasks-tab">
      <section className="tasks-summary-panel">
        <div className="tasks-summary-grid">
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
      </section>

      <section className="tasks-list-panel">
        <div className="tasks-list-panel__header">
          <h3>{text.allTasks}</h3>
          <p>{text.tasksIntro}</p>
        </div>

        <div className="tasks-list-grid">
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
              <article key={task.taskType} className="task-card">
                <div className="task-card__header">
                  <div className="task-card__body">
                    <div className="task-card__title">{content.title}</div>
                    <p className="task-card__description">{content.description}</p>
                  </div>
                  <span className="task-card__reward">{text.taskReward(task.xpReward)}</span>
                </div>

                <div className="task-card__meta">
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
                    className={getTaskButtonClassName(Boolean(claimingTaskType) || !user || task.claimed)}
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
                    className={getTaskButtonClassName(!canClaimManually || isClaiming)}
                  >
                    {isClaiming ? text.claimingTask : content.buttonLabel}
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      <section className="tasks-referral-panel">
        <h3 className="tasks-referral-panel__title">{text.referralLink}</h3>
        <p className="tasks-referral-panel__copy">{text.referralDescription}</p>
        <input readOnly value={summary?.referralLink || ""} className="tasks-referral-input" />
        <button
          type="button"
          onClick={() => void copyReferralLink()}
          disabled={!summary?.referralLink}
          className="tasks-copy-button"
        >
          {text.copyLink}
        </button>

        {user?.authSource === "dev" ? <p className="tasks-dev-hint">{text.localDevHint}</p> : null}

        {user?.authSource === "dev" && localDevReferralLinks.length > 0 ? (
          <div className="tasks-dev-links">
            {localDevReferralLinks.map((entry) => (
              <div key={entry.devUser} className="tasks-dev-link-card">
                <div className="tasks-dev-link-card__label">{text.openAsDevUser(entry.devUser)}</div>
                <code className="tasks-dev-link-card__code">{entry.link}</code>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {isLoading ? <p className="section-status-text">{text.loadingTasks}</p> : null}
      {error ? <p className="feedback-text feedback-text--error">{error}</p> : null}
      {success ? <p className="feedback-text feedback-text--success">{success}</p> : null}
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

function getTaskButtonClassName(disabled: boolean) {
  return ["task-action-button", disabled ? "is-disabled" : ""].filter(Boolean).join(" ");
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="tasks-stat-card">
      <div className="tasks-stat-card__label">{label}</div>
      <div className="tasks-stat-card__value">{value}</div>
    </div>
  );
}
