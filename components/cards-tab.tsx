"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { copy } from "@/lib/i18n";
import type { AppLanguage, AuthenticatedAppUser } from "@/types/telegram";
import { CardRecord } from "@/types/cards";

type CardsTabProps = {
  initData: string;
  devUser: string;
  user: AuthenticatedAppUser | null;
  language: AppLanguage;
};

type CardsResponse = {
  cards?: CardRecord[];
  error?: string;
};

type CreateCardResponse = {
  card?: CardRecord;
  error?: string;
};

type VoteResponse = {
  voteCount?: number;
  userHasVoted?: boolean;
  error?: string;
};

const MAX_CAPTION_LENGTH = 280;

export function CardsTab({ initData, devUser, user, language }: CardsTabProps) {
  const [cards, setCards] = useState<CardRecord[]>([]);
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const text = copy[language];
  const dateLocale = language === "ja" ? "ja-JP" : "en-US";

  useEffect(() => {
    async function loadCards() {
      try {
        const response = await fetch("/api/cards", {
          cache: "no-store",
          headers: {
            "x-telegram-init-data": initData,
            "x-dev-user": devUser,
          },
        });
        const payload = (await response.json()) as CardsResponse;

        if (!response.ok || !payload.cards) {
          throw new Error(payload.error || text.loadCardsError);
        }

        setCards(payload.cards);
      } catch (caughtError) {
        const message = caughtError instanceof Error ? caughtError.message : text.loadCardsError;
        setError(message);
      } finally {
        setIsLoading(false);
      }
    }

    void loadCards();
  }, [devUser, initData, text.loadCardsError]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError(null);
    setSuccess(null);

    if (!user) {
      setError(text.authenticateBeforeUpload);
      return;
    }

    if (!file) {
      setError(text.chooseImageBeforeSubmit);
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("caption", caption);
      formData.append("image", file);
      formData.append("initData", initData);
      formData.append("devUser", devUser);

      const response = await fetch("/api/cards", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as CreateCardResponse;

      if (!response.ok || !payload.card) {
        throw new Error(payload.error || text.uploadCardError);
      }

      setCards((currentCards) => [payload.card!, ...currentCards]);
      setCaption("");
      setFile(null);
      setSuccess(text.cardUploaded);

      const fileInput = form.elements.namedItem("image");

      if (fileInput instanceof HTMLInputElement) {
        fileInput.value = "";
      }
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : text.uploadCardError;
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVote(cardId: number) {
    if (!user) {
      setError(text.authenticateBeforeVote);
      return;
    }

    const currentCard = cards.find((card) => card.id === cardId);

    if (!currentCard) {
      return;
    }

    const optimisticHasVoted = !currentCard.userHasVoted;
    const optimisticVoteCount = currentCard.voteCount + (optimisticHasVoted ? 1 : -1);

    setError(null);
    setCards((currentCards) =>
      currentCards.map((card) =>
        card.id === cardId
          ? {
              ...card,
              userHasVoted: optimisticHasVoted,
              voteCount: optimisticVoteCount,
            }
          : card,
      ),
    );

    try {
      const response = await fetch(`/api/cards/${cardId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, devUser }),
      });

      const payload = (await response.json()) as VoteResponse;

      if (!response.ok || payload.voteCount === undefined || payload.userHasVoted === undefined) {
        throw new Error(payload.error || text.updateVoteError);
      }

      setCards((currentCards) =>
        currentCards.map((card) =>
          card.id === cardId
            ? {
                ...card,
                voteCount: payload.voteCount!,
                userHasVoted: payload.userHasVoted!,
              }
            : card,
        ),
      );
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : text.updateVoteError;
      setError(message);
      setCards((currentCards) =>
        currentCards.map((card) =>
          card.id === cardId
            ? {
                ...card,
                userHasVoted: currentCard.userHasVoted,
                voteCount: currentCard.voteCount,
              }
            : card,
        ),
      );
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
        <p style={{ marginTop: 0, color: "var(--text-muted)" }}>
          {text.uploadCardIntro}
        </p>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 8 }}>
            <span style={{ fontWeight: 700 }}>{text.caption}</span>
            <textarea
              name="caption"
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              maxLength={MAX_CAPTION_LENGTH}
              rows={4}
              placeholder={text.captionPlaceholder}
              style={fieldStyle}
            />
            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
              {caption.length}/{MAX_CAPTION_LENGTH}
            </span>
          </label>

          <label style={{ display: "grid", gap: 8 }}>
            <span style={{ fontWeight: 700 }}>{text.image}</span>
            <input
              name="image"
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
              style={fieldStyle}
            />
            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
              {text.imageHint}
            </span>
          </label>

          <button
            type="submit"
            disabled={isSubmitting || !user}
            style={{
              border: 0,
              borderRadius: 14,
              padding: "14px 16px",
              fontWeight: 700,
              cursor: isSubmitting || !user ? "not-allowed" : "pointer",
              background: isSubmitting || !user ? "rgba(255,255,255,0.12)" : "var(--accent)",
              color: isSubmitting || !user ? "var(--text-muted)" : "#1b1612",
            }}
          >
            {isSubmitting ? text.uploading : text.submitCard}
          </button>
        </form>

        {error ? <p style={{ marginBottom: 0, color: "#ffb4ab" }}>{error}</p> : null}
        {success ? <p style={{ marginBottom: 0, color: "#8fe388" }}>{success}</p> : null}
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 22 }}>{text.latestCards}</h3>
          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
            {text.newestFirst}
          </span>
        </div>

        {isLoading ? <p style={{ color: "var(--text-muted)" }}>{text.loadingGallery}</p> : null}

        {!isLoading && cards.length === 0 ? (
          <div
            style={{
              marginTop: 16,
              borderRadius: 18,
              padding: 16,
              border: "1px dashed var(--border)",
              color: "var(--text-muted)",
            }}
          >
            {text.noCardsYet}
          </div>
        ) : null}

        <div
          style={{
            marginTop: 16,
            display: "grid",
            gap: 14,
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          }}
        >
          {cards.map((card) => (
            <article
              key={card.id}
              style={{
                overflow: "hidden",
                borderRadius: 18,
                border: "1px solid var(--border)",
                background: "rgba(42, 34, 29, 0.86)",
              }}
            >
              <div style={{ position: "relative", aspectRatio: "4 / 5", background: "#120f0d" }}>
                <Image
                  src={card.imageUrl}
                  alt={card.caption}
                  fill
                  sizes="(max-width: 768px) 100vw, 33vw"
                  style={{ objectFit: "cover" }}
                  unoptimized
                />
              </div>
              <div style={{ padding: 14 }}>
                <p style={{ marginTop: 0, lineHeight: 1.5 }}>{card.caption}</p>
                <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
                  <div>{card.authorDisplayName}</div>
                  <div>{new Date(card.createdAt).toLocaleString(dateLocale)}</div>
                </div>
                <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{text.voteCount(card.voteCount)}</span>
                  <button
                    type="button"
                    onClick={() => void handleVote(card.id)}
                    disabled={!user || card.authorTelegramId === user.telegramId}
                    style={{
                      border: 0,
                      borderRadius: 12,
                      padding: "10px 12px",
                      fontWeight: 700,
                      cursor:
                        !user || card.authorTelegramId === user.telegramId ? "not-allowed" : "pointer",
                      background: card.userHasVoted ? "var(--accent)" : "rgba(255,255,255,0.08)",
                      color: card.userHasVoted ? "#1b1612" : "var(--text)",
                    }}
                  >
                    {card.authorTelegramId === user?.telegramId
                      ? text.yourCard
                      : card.userHasVoted
                        ? text.removeVote
                        : text.vote}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

const fieldStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 14,
  border: "1px solid var(--border)",
  background: "rgba(20, 15, 13, 0.8)",
  color: "var(--text)",
  padding: "12px 14px",
};
