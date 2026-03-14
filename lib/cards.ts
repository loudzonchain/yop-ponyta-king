import { QueryResult } from "pg";
import { getPool } from "@/lib/db";
import { mutateLocalStore, readLocalStore } from "@/lib/local-store";
import { resolveStorageMode } from "@/lib/schema";
import {
  maybeClaimSubmitCardTaskInDatabase,
  maybeClaimSubmitCardTaskInStore,
  recordVoteProgressInDatabase,
  recordVoteProgressInStore,
} from "@/lib/tasks";
import { AuthenticatedAppUser } from "@/types/telegram";
import { CardRecord } from "@/types/cards";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_CAPTION_LENGTH = 280;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

type CardRow = {
  id: number;
  caption: string;
  image_url: string;
  author_telegram_id: string;
  author_display_name: string;
  author_username: string | null;
  vote_count: string | number;
  user_has_voted: boolean;
  created_at: Date;
};

function mapCardRow(row: CardRow): CardRecord {
  return {
    id: row.id,
    caption: row.caption,
    imageUrl: row.image_url,
    authorTelegramId: Number(row.author_telegram_id),
    authorDisplayName: row.author_display_name,
    authorUsername: row.author_username || undefined,
    voteCount: Number(row.vote_count),
    userHasVoted: row.user_has_voted,
    createdAt: row.created_at.toISOString(),
  };
}

export function validateCaption(rawCaption: FormDataEntryValue | null) {
  const caption = typeof rawCaption === "string" ? rawCaption.trim() : "";

  if (!caption) {
    throw new Error("Caption is required.");
  }

  if (caption.length > MAX_CAPTION_LENGTH) {
    throw new Error(`Caption must be ${MAX_CAPTION_LENGTH} characters or less.`);
  }

  return caption;
}

export function validateCardFile(file: FormDataEntryValue | null) {
  if (!(file instanceof File)) {
    throw new Error("Image is required.");
  }

  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Image must be JPEG, PNG, GIF, or WebP.");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("Image must be 5MB or smaller.");
  }

  return file;
}

export async function createCard(input: {
  caption: string;
  imageUrl: string;
  user: AuthenticatedAppUser;
}) {
  const mode = await resolveStorageMode();

  if (mode === "local") {
    return mutateLocalStore((store) => {
      const nextId =
        store.cards.length === 0
          ? 1
          : Math.max(...store.cards.map((card) => card.id)) + 1;

      const card: CardRecord = {
        id: nextId,
        caption: input.caption,
        imageUrl: input.imageUrl,
        authorTelegramId: input.user.telegramId,
        authorDisplayName: input.user.displayName,
        authorUsername: input.user.username,
        voteCount: 0,
        userHasVoted: false,
        createdAt: new Date().toISOString(),
      };

      store.cards.unshift(card);
      maybeClaimSubmitCardTaskInStore(store, input.user.telegramId);
      return card;
    });
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");

    const result: QueryResult<CardRow> = await client.query(
      `
        insert into public.cards (author_telegram_id, caption, image_url)
        values ($1, $2, $3)
        returning
          id,
          caption,
          image_url,
          author_telegram_id,
          $4::text as author_display_name,
          $5::text as author_username,
          0::int as vote_count,
          false as user_has_voted,
          created_at
      `,
      [
        input.user.telegramId,
        input.caption,
        input.imageUrl,
        input.user.displayName,
        input.user.username || null,
      ],
    );

    await maybeClaimSubmitCardTaskInDatabase(client, input.user.telegramId);
    await client.query("commit");

    return mapCardRow(result.rows[0]);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function listCards(viewerTelegramId?: number) {
  const mode = await resolveStorageMode();

  if (mode === "local") {
    const store = await readLocalStore();

    return [...store.cards]
      .map((card) => {
        const voteCount = store.votes.filter((vote) => vote.cardId === card.id).length;
        const userHasVoted = viewerTelegramId
          ? store.votes.some(
              (vote) => vote.cardId === card.id && vote.voterTelegramId === viewerTelegramId,
            )
          : false;

        return {
          ...card,
          voteCount,
          userHasVoted,
        };
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  const pool = getPool();
  const result: QueryResult<CardRow> = await pool.query(
    `
    select
      cards.id,
      cards.caption,
      cards.image_url,
      cards.author_telegram_id,
      users.display_name as author_display_name,
      users.username as author_username,
      count(card_votes.id)::int as vote_count,
      coalesce(bool_or(card_votes.voter_telegram_id = $1), false) as user_has_voted,
      cards.created_at
    from public.cards as cards
    join public.users as users
      on users.telegram_id = cards.author_telegram_id
    left join public.card_votes
      on card_votes.card_id = cards.id
    group by
      cards.id,
      cards.caption,
      cards.image_url,
      cards.author_telegram_id,
      users.display_name,
      users.username,
      cards.created_at
    order by cards.created_at desc
    limit 50
  `,
    [viewerTelegramId || 0],
  );

  return result.rows.map(mapCardRow);
}

export async function toggleCardVote(input: {
  cardId: number;
  user: AuthenticatedAppUser;
}) {
  const mode = await resolveStorageMode();

  if (mode === "local") {
    return mutateLocalStore((store) => {
      const card = store.cards.find((entry) => entry.id === input.cardId);

      if (!card) {
        throw new Error("Card not found.");
      }

      if (card.authorTelegramId === input.user.telegramId) {
        throw new Error("You cannot vote on your own card.");
      }

      const voteIndex = store.votes.findIndex(
        (vote) => vote.cardId === input.cardId && vote.voterTelegramId === input.user.telegramId,
      );
      const author = store.users.find((entry) => entry.telegramId === card.authorTelegramId);

      if (!author) {
        throw new Error("Card author not found.");
      }

      let userHasVoted = false;

      if (voteIndex >= 0) {
        store.votes.splice(voteIndex, 1);
        author.xp = Math.max(0, author.xp - 2);
        userHasVoted = false;
      } else {
        store.votes.push({
          cardId: input.cardId,
          voterTelegramId: input.user.telegramId,
          createdAt: new Date().toISOString(),
        });
        author.xp += 2;
        userHasVoted = true;
        recordVoteProgressInStore(store, input.user.telegramId);
      }

      return {
        voteCount: store.votes.filter((vote) => vote.cardId === input.cardId).length,
        userHasVoted,
        authorXp: author.xp,
      };
    });
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");

    const cardResult = await client.query<{
      author_telegram_id: string;
    }>(
      `
        select author_telegram_id
        from public.cards
        where id = $1
        for update
      `,
      [input.cardId],
    );

    const card = cardResult.rows[0];

    if (!card) {
      throw new Error("Card not found.");
    }

    if (Number(card.author_telegram_id) === input.user.telegramId) {
      throw new Error("You cannot vote on your own card.");
    }

    const existingVote = await client.query<{ id: string }>(
      `
        select id
        from public.card_votes
        where card_id = $1 and voter_telegram_id = $2
      `,
      [input.cardId, input.user.telegramId],
    );

    let userHasVoted: boolean;

    if (existingVote.rows[0]) {
      await client.query(
        `
          delete from public.card_votes
          where card_id = $1 and voter_telegram_id = $2
        `,
        [input.cardId, input.user.telegramId],
      );
      await client.query(
        `
          update public.users
          set xp = greatest(0, xp - 2), updated_at = now()
          where telegram_id = $1
        `,
        [card.author_telegram_id],
      );
      userHasVoted = false;
    } else {
      await client.query(
        `
          insert into public.card_votes (card_id, voter_telegram_id)
          values ($1, $2)
        `,
        [input.cardId, input.user.telegramId],
      );
      await client.query(
        `
          update public.users
          set xp = xp + 2, updated_at = now()
          where telegram_id = $1
        `,
        [card.author_telegram_id],
      );
      await recordVoteProgressInDatabase(client, input.user.telegramId);
      userHasVoted = true;
    }

    const summary = await client.query<{
      vote_count: string;
      author_xp: number;
    }>(
      `
        select
          count(card_votes.id)::text as vote_count,
          users.xp as author_xp
        from public.cards
        join public.users
          on users.telegram_id = public.cards.author_telegram_id
        left join public.card_votes
          on card_votes.card_id = public.cards.id
        where public.cards.id = $1
        group by users.xp
      `,
      [input.cardId],
    );

    await client.query("commit");

    return {
      voteCount: Number(summary.rows[0]?.vote_count || 0),
      userHasVoted,
      authorXp: summary.rows[0]?.author_xp || 0,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
