"use client";

import { useEffect, useState } from "react";
import { copy } from "@/lib/i18n";
import { LeaderboardEntry } from "@/types/cards";
import type { AppLanguage, AuthenticatedAppUser } from "@/types/telegram";

type RanksTabProps = {
  devUser: string;
  user: AuthenticatedAppUser | null;
  language: AppLanguage;
};

type LeaderboardResponse = {
  leaderboard?: LeaderboardEntry[];
  error?: string;
};

export function RanksTab({ devUser, user, language }: RanksTabProps) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const text = copy[language];

  useEffect(() => {
    async function loadLeaderboard() {
      try {
        const response = await fetch("/api/leaderboard", {
          cache: "no-store",
          headers: { "x-dev-user": devUser },
        });
        const payload = (await response.json()) as LeaderboardResponse;

        if (!response.ok || !payload.leaderboard) {
          throw new Error(payload.error || text.loadLeaderboardError);
        }

        setLeaderboard(payload.leaderboard);
      } catch (caughtError) {
        const message =
          caughtError instanceof Error ? caughtError.message : text.loadLeaderboardError;
        setError(message);
      } finally {
        setIsLoading(false);
      }
    }

    void loadLeaderboard();
  }, [devUser, text.loadLeaderboardError]);

  return (
    <div className="ranks-tab">
      <section className="leaderboard-intro-panel">
        <p className="leaderboard-intro-copy">{text.leaderboardIntro}</p>
      </section>

      {isLoading ? <p className="section-status-text">{text.loadingLeaderboard}</p> : null}
      {error ? <p className="feedback-text feedback-text--error">{error}</p> : null}

      {!isLoading && leaderboard.length === 0 ? (
        <div className="empty-state-card">{text.noRankedUsers}</div>
      ) : null}

      <div className="leaderboard-list">
        {leaderboard.map((entry) => {
          const isCurrentUser = entry.telegramId === user?.telegramId;
          const rankToneClassName = getRankToneClassName(entry.rank);

          return (
            <div
              key={entry.telegramId}
              className={["leaderboard-row", isCurrentUser ? "leaderboard-row--current" : ""]
                .filter(Boolean)
                .join(" ")}
            >
              <div className={["leaderboard-rank", rankToneClassName].join(" ")}>
                {entry.rank <= 3 ? (
                  <span className="leaderboard-rank__medal" aria-hidden="true">
                    {getRankMedal(entry.rank)}
                  </span>
                ) : null}
                <span className="leaderboard-rank__value">#{entry.rank}</span>
              </div>
              <div className="leaderboard-user">
                <div className="leaderboard-user__name">{entry.displayName}</div>
                <div className="leaderboard-user__handle">
                  {entry.username ? `@${entry.username}` : text.noUsername}
                </div>
              </div>
              <div className="leaderboard-score">
                <div className="leaderboard-score__value">
                  {entry.xp} {text.xp}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getRankMedal(rank: number) {
  if (rank === 1) {
    return "🥇";
  }

  if (rank === 2) {
    return "🥈";
  }

  if (rank === 3) {
    return "🥉";
  }

  return "";
}

function getRankToneClassName(rank: number) {
  if (rank === 1) {
    return "leaderboard-rank--gold";
  }

  if (rank === 2) {
    return "leaderboard-rank--silver";
  }

  if (rank === 3) {
    return "leaderboard-rank--bronze";
  }

  return "leaderboard-rank--default";
}
