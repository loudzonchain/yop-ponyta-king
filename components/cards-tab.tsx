"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { copy } from "@/lib/i18n";
import { triggerLightImpact } from "@/lib/telegram-webapp";
import type { AppLanguage, AuthenticatedAppUser } from "@/types/telegram";
import { CardRecord } from "@/types/cards";

type CardsTabProps = {
  initData: string;
  devUser: string;
  user: AuthenticatedAppUser | null;
  language: AppLanguage;
  onSummaryRefresh?: () => Promise<void>;
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

export function CardsTab({ initData, devUser, user, language, onSummaryRefresh }: CardsTabProps) {
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
      await onSummaryRefresh?.();

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

    triggerLightImpact();

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
      await onSummaryRefresh?.();
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
    <div className="cards-tab">
      <section className="cards-submit-panel">
        <p className="cards-panel-copy">{text.uploadCardIntro}</p>
        <form onSubmit={handleSubmit} className="cards-form">
          <label className="cards-field-group">
            <span className="cards-field-label">{text.caption}</span>
            <textarea
              name="caption"
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              maxLength={MAX_CAPTION_LENGTH}
              rows={4}
              placeholder={text.captionPlaceholder}
              className="cards-field cards-field--textarea"
            />
            <span className="cards-field-hint">
              {caption.length}/{MAX_CAPTION_LENGTH}
            </span>
          </label>

          <label className="cards-field-group">
            <span className="cards-field-label">{text.image}</span>
            <input
              name="image"
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
              className="cards-field cards-field--file"
            />
            <span className="cards-field-hint">{text.imageHint}</span>
          </label>

          <button type="submit" disabled={isSubmitting || !user} className="cards-submit-button">
            {isSubmitting ? text.uploading : text.submitCard}
          </button>
        </form>

        {error ? <p className="feedback-text feedback-text--error">{error}</p> : null}
        {success ? <p className="feedback-text feedback-text--success">{success}</p> : null}
      </section>

      <section className="cards-gallery-section">
        <div className="cards-gallery-header">
          <h3 className="cards-gallery-title">{text.latestCards}</h3>
          <span className="cards-gallery-meta">{text.newestFirst}</span>
        </div>

        {isLoading ? <p className="section-status-text">{text.loadingGallery}</p> : null}

        {!isLoading && cards.length === 0 ? (
          <div className="empty-state-card">{text.noCardsYet}</div>
        ) : null}

        <div className="card-gallery-grid">
          {cards.map((card) => {
            const voteDisabled = !user || card.authorTelegramId === user.telegramId;

            return (
              <article key={card.id} className="card-gallery-item">
                <div className="card-gallery-item__media">
                  <Image
                    src={card.imageUrl}
                    alt={card.caption}
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="card-gallery-item__image"
                    unoptimized
                  />
                </div>
                <div className="card-gallery-item__content">
                  <p className="card-gallery-item__caption">{card.caption}</p>
                  <div className="card-gallery-item__meta">
                    <div>{card.authorDisplayName}</div>
                    <div>{new Date(card.createdAt).toLocaleString(dateLocale)}</div>
                  </div>
                  <div className="card-gallery-item__footer">
                    <span className="card-gallery-item__votes">{text.voteCount(card.voteCount)}</span>
                    <button
                      type="button"
                      onClick={() => void handleVote(card.id)}
                      disabled={voteDisabled}
                      className={getVoteButtonClassName(card.userHasVoted, voteDisabled)}
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
            );
          })}
        </div>
      </section>
    </div>
  );
}

function getVoteButtonClassName(isVoted: boolean, isDisabled: boolean) {
  return [
    "card-gallery-item__vote-button",
    isVoted ? "is-voted" : "",
    isDisabled ? "is-disabled" : "",
  ]
    .filter(Boolean)
    .join(" ");
}
