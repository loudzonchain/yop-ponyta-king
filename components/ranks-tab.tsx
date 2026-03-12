"use client";

import { useEffect, useState } from "react";
import { AuthenticatedAppUser } from "@/types/telegram";
import { LeaderboardEntry } from "@/types/cards";

type RanksTabProps = {
  devUser: string;
  user: AuthenticatedAppUser | null;
};

type LeaderboardResponse = {
  leaderboard?: LeaderboardEntry[];
  error?: string;
};

export function RanksTab({ devUser, user }: RanksTabProps) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadLeaderboard() {
      try {
        const response = await fetch("/api/leaderboard", {
          cache: "no-store",
          headers: { "x-dev-user": devUser },
        });
        const payload = (await response.json()) as LeaderboardResponse;

        if (!response.ok || !payload.leaderboard) {
          throw new Error(payload.error || "Unable to load leaderboard.");
        }

        setLeaderboard(payload.leaderboard);
      } catch (caughtError) {
        const message =
          caughtError instanceof Error ? caughtError.message : "Unable to load leaderboard.";
        setError(message);
      } finally {
        setIsLoading(false);
      }
    }

    void loadLeaderboard();
  }, [devUser]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div
        style={{
          borderRadius: 18,
          padding: 16,
          background: "var(--panel-muted)",
          border: "1px solid var(--border)",
        }}
      >
        <p style={{ margin: 0, color: "var(--text-muted)" }}>
          Users are ranked by XP earned from votes received on their cards.
        </p>
      </div>

      {isLoading ? <p style={{ color: "var(--text-muted)" }}>Loading leaderboard...</p> : null}
      {error ? <p style={{ color: "#ffb4ab" }}>{error}</p> : null}

      {!isLoading && leaderboard.length === 0 ? (
        <div
          style={{
            borderRadius: 18,
            padding: 16,
            border: "1px dashed var(--border)",
            color: "var(--text-muted)",
          }}
        >
          No ranked users yet. Votes will populate the leaderboard.
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 10 }}>
        {leaderboard.map((entry) => {
          const isCurrentUser = entry.telegramId === user?.telegramId;

          return (
            <div
              key={entry.telegramId}
              style={{
                display: "grid",
                gridTemplateColumns: "56px 1fr auto",
                gap: 12,
                alignItems: "center",
                borderRadius: 18,
                padding: 14,
                border: "1px solid var(--border)",
                background: isCurrentUser ? "var(--accent-soft)" : "rgba(42, 34, 29, 0.86)",
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 700, color: isCurrentUser ? "var(--accent)" : "var(--text)" }}>
                #{entry.rank}
              </div>
              <div>
                <div style={{ fontWeight: 700 }}>{entry.displayName}</div>
                <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
                  {entry.username ? `@${entry.username}` : "No username"}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700 }}>{entry.xp} XP</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
