import crypto from "node:crypto";
import path from "node:path";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { QueryResult } from "pg";
import { getPool } from "@/lib/db";
import { AuthenticatedAppUser } from "@/types/telegram";
import { CardRecord } from "@/types/cards";
import { TaskSummary } from "@/types/tasks";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_CAPTION_LENGTH = 280;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

let schemaReady = false;
let storageMode: "database" | "local" | null = null;
let localStoreMutationQueue: Promise<void> = Promise.resolve();

type LocalUserRecord = {
  telegramId: number;
  username?: string;
  firstName: string;
  lastName?: string;
  displayName: string;
  language: AuthenticatedAppUser["language"];
  xp: number;
  currentStreak: number;
  lastCheckInDate?: string;
  referralCode: string;
  referredByTelegramId?: number;
};

type LocalStore = {
  users: LocalUserRecord[];
  cards: CardRecord[];
  votes: { cardId: number; voterTelegramId: number }[];
};

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

function getLocalStorePath() {
  const dataDir = process.env.LOCAL_DATA_DIR || "./.data";
  return path.resolve(process.cwd(), dataDir, "cards.json");
}

async function ensureLocalStore() {
  const storePath = getLocalStorePath();
  const directory = path.dirname(storePath);

  await mkdir(directory, { recursive: true });

  try {
    await readFile(storePath, "utf8");
  } catch {
    const initialStore: LocalStore = { users: [], cards: [], votes: [] };
    await writeFile(storePath, JSON.stringify(initialStore, null, 2), "utf8");
  }

  return storePath;
}

function normalizeCardRecord(card: Partial<CardRecord>): CardRecord {
  return {
    id: Number(card.id || 0),
    caption: card.caption || "",
    imageUrl: card.imageUrl || "",
    authorTelegramId: Number(card.authorTelegramId || 0),
    authorDisplayName: card.authorDisplayName || "Unknown User",
    authorUsername: card.authorUsername || undefined,
    voteCount: Number(card.voteCount || 0),
    userHasVoted: Boolean(card.userHasVoted),
    createdAt: card.createdAt || new Date(0).toISOString(),
  };
}

function buildReferralCode(user: AuthenticatedAppUser) {
  return user.username || `ref_${user.telegramId}`;
}

function getTodayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function getPreviousUtcDay(date: string) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

function getEffectiveStreak(lastCheckInDate?: string, currentStreak = 0) {
  if (!lastCheckInDate || currentStreak === 0) {
    return 0;
  }

  const today = getTodayUtc();

  if (lastCheckInDate === today || lastCheckInDate === getPreviousUtcDay(today)) {
    return currentStreak;
  }

  return 0;
}

function parseLocalStore(contents: string) {
  try {
    return {
      store: JSON.parse(contents) as Partial<LocalStore>,
      recovered: false,
    };
  } catch {
    const match = contents.match(/\{[\s\S]*"votes"\s*:\s*\[[\s\S]*?\]\s*\}/);

    if (!match) {
      throw new Error("Local cards store is corrupted.");
    }

    return {
      store: JSON.parse(match[0]) as Partial<LocalStore>,
      recovered: true,
    };
  }
}

async function readLocalStore() {
  const storePath = await ensureLocalStore();
  const contents = await readFile(storePath, "utf8");
  const parsed = parseLocalStore(contents);
  const store = parsed.store;
  return {
    users: (store.users || []).map((user) => ({
      ...user,
      xp: user.xp ?? 0,
      currentStreak: user.currentStreak ?? 0,
      referralCode: user.referralCode || `ref_${user.telegramId}`,
    })),
    cards: (store.cards || []).map(normalizeCardRecord),
    votes: store.votes || [],
  } satisfies LocalStore;
}

async function writeLocalStore(store: LocalStore) {
  const storePath = await ensureLocalStore();
  const tempPath = `${storePath}.${process.pid}.${crypto.randomUUID()}.tmp`;

  await writeFile(tempPath, JSON.stringify(store, null, 2), "utf8");
  await rename(tempPath, storePath);
}

async function withLocalStoreFileLock<T>(callback: () => Promise<T>) {
  const storePath = getLocalStorePath();
  const lockPath = `${storePath}.lock`;

  for (;;) {
    try {
      await mkdir(lockPath);
      break;
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  try {
    return await callback();
  } finally {
    await rm(lockPath, { recursive: true, force: true });
  }
}

async function mutateLocalStore<T>(mutator: (store: LocalStore) => Promise<T> | T) {
  const pendingMutation = localStoreMutationQueue.then(async () => {
    return withLocalStoreFileLock(async () => {
      const store = await readLocalStore();
      const result = await mutator(store);
      await writeLocalStore(store);
      return result;
    });
  });

  localStoreMutationQueue = pendingMutation.then(
    () => undefined,
    () => undefined,
  );

  return pendingMutation;
}

async function resolveStorageMode() {
  if (storageMode) {
    return storageMode;
  }

  try {
    const pool = getPool();
    await pool.query("select 1");
    storageMode = "database";
  } catch {
    storageMode = "local";
  }

  return storageMode;
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

export async function ensureCardSchema() {
  const mode = await resolveStorageMode();

  if (mode === "local" || schemaReady) {
    return;
  }

  const pool = getPool();

  await pool.query(`
    create table if not exists public.users (
      id bigserial primary key,
      telegram_id bigint not null unique,
      username text,
      first_name text not null,
      last_name text,
      display_name text not null,
      language text not null default 'en' check (language in ('en', 'ja')),
      xp integer not null default 0,
      photo_url text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await pool.query(`
    alter table public.users
    add column if not exists xp integer not null default 0;
  `);

  await pool.query(`
    alter table public.users
    add column if not exists current_streak integer not null default 0;
  `);

  await pool.query(`
    alter table public.users
    add column if not exists last_check_in_date date;
  `);

  await pool.query(`
    alter table public.users
    add column if not exists referral_code text;
  `);

  await pool.query(`
    alter table public.users
    add column if not exists referred_by_telegram_id bigint references public.users(telegram_id) on delete set null;
  `);

  await pool.query(`
    update public.users
    set referral_code = coalesce(referral_code, concat('ref_', telegram_id::text))
    where referral_code is null;
  `);

  await pool.query(`
    create unique index if not exists users_referral_code_idx on public.users (referral_code);
  `);

  await pool.query(`
    create table if not exists public.cards (
      id bigserial primary key,
      author_telegram_id bigint not null references public.users(telegram_id) on delete cascade,
      caption varchar(280) not null,
      image_url text not null,
      created_at timestamptz not null default now()
    );
  `);

  await pool.query(
    "create index if not exists cards_created_at_idx on public.cards (created_at desc);",
  );

  await pool.query(`
    create table if not exists public.card_votes (
      id bigserial primary key,
      card_id bigint not null references public.cards(id) on delete cascade,
      voter_telegram_id bigint not null references public.users(telegram_id) on delete cascade,
      created_at timestamptz not null default now(),
      unique (card_id, voter_telegram_id)
    );
  `);

  await pool.query(
    "create index if not exists card_votes_card_id_idx on public.card_votes (card_id);",
  );

  schemaReady = true;
}

export async function upsertUser(
  user: AuthenticatedAppUser,
  options?: { referralCode?: string | null },
) {
  const mode = await resolveStorageMode();

  if (mode === "local") {
    await mutateLocalStore((store) => {
      const existingUser = store.users.find((entry) => entry.telegramId === user.telegramId);

      if (existingUser) {
        existingUser.username = user.username;
        existingUser.firstName = user.firstName;
        existingUser.lastName = user.lastName;
        existingUser.displayName = user.displayName;
        existingUser.language = user.language;
        existingUser.xp = existingUser.xp ?? 0;
        existingUser.currentStreak = getEffectiveStreak(
          existingUser.lastCheckInDate,
          existingUser.currentStreak ?? 0,
        );
        existingUser.referralCode = existingUser.referralCode || buildReferralCode(user);
        if (!existingUser.referredByTelegramId && options?.referralCode) {
          const referredBy = store.users.find((entry) => entry.referralCode === options.referralCode);

          if (referredBy && referredBy.telegramId !== user.telegramId) {
            existingUser.referredByTelegramId = referredBy.telegramId;
          }
        }
      } else {
        const referredBy = options?.referralCode
          ? store.users.find((entry) => entry.referralCode === options.referralCode)
          : undefined;
        store.users.push({
          telegramId: user.telegramId,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          displayName: user.displayName,
          language: user.language,
          xp: 0,
          currentStreak: 0,
          referralCode: buildReferralCode(user),
          referredByTelegramId:
            referredBy && referredBy.telegramId !== user.telegramId ? referredBy.telegramId : undefined,
        });
      }
    });
    return;
  }

  const pool = getPool();

  await pool.query(
    `
      insert into public.users (
        telegram_id,
        username,
        first_name,
        last_name,
        display_name,
        language,
        referral_code
      )
      values ($1, $2, $3, $4, $5, $6, $7)
      on conflict (telegram_id)
      do update set
        username = excluded.username,
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        display_name = excluded.display_name,
        language = excluded.language,
        referral_code = coalesce(public.users.referral_code, excluded.referral_code),
        updated_at = now()
    `,
    [
      user.telegramId,
      user.username || null,
      user.firstName,
      user.lastName || null,
      user.displayName,
      user.language,
      buildReferralCode(user),
    ],
  );

  if (options?.referralCode) {
    await pool.query(
      `
        update public.users as current_user
        set referred_by_telegram_id = referrer.telegram_id
        from public.users as referrer
        where current_user.telegram_id = $1
          and current_user.referred_by_telegram_id is null
          and referrer.referral_code = $2
          and referrer.telegram_id <> $1
      `,
      [user.telegramId, options.referralCode],
    );
  }
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
      return card;
    });
  }

  const pool = getPool();
  const result: QueryResult<CardRow> = await pool.query(
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

  return mapCardRow(result.rows[0]);
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
        store.votes.push({ cardId: input.cardId, voterTelegramId: input.user.telegramId });
        author.xp += 2;
        userHasVoted = true;
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

export async function listLeaderboard() {
  const mode = await resolveStorageMode();

  if (mode === "local") {
    const store = await readLocalStore();
    return [...store.users]
      .sort((left, right) => right.xp - left.xp || left.displayName.localeCompare(right.displayName))
      .slice(0, 100)
      .map((user, index) => ({
        telegramId: user.telegramId,
        displayName: user.displayName,
        username: user.username,
        xp: user.xp,
        rank: index + 1,
      }));
  }

  const pool = getPool();
  const result = await pool.query<{
    telegram_id: string;
    display_name: string;
    username: string | null;
    xp: number;
    rank: string;
  }>(
    `
      select
        telegram_id,
        display_name,
        username,
        xp,
        row_number() over (order by xp desc, created_at asc) as rank
      from public.users
      order by xp desc, created_at asc
      limit 100
    `,
  );

  return result.rows.map((row) => ({
    telegramId: Number(row.telegram_id),
    displayName: row.display_name,
    username: row.username || undefined,
    xp: row.xp,
    rank: Number(row.rank),
  }));
}

export async function getTaskSummary(
  user: AuthenticatedAppUser,
  origin: string,
): Promise<TaskSummary> {
  const mode = await resolveStorageMode();

  if (mode === "local") {
    const store = await readLocalStore();
    const currentUser = store.users.find((entry) => entry.telegramId === user.telegramId);

    if (!currentUser) {
      throw new Error("User not found.");
    }

    const today = getTodayUtc();
    const currentStreak = getEffectiveStreak(currentUser.lastCheckInDate, currentUser.currentStreak);

    return {
      currentStreak,
      checkedInToday: currentUser.lastCheckInDate === today,
      referralCode: currentUser.referralCode,
      referralCount: store.users.filter(
        (entry) => entry.referredByTelegramId === currentUser.telegramId,
      ).length,
      referralLink: `${origin}/?ref=${currentUser.referralCode}`,
      xp: currentUser.xp,
    };
  }

  const pool = getPool();
  const result = await pool.query<{
    current_streak: number;
    last_check_in_date: string | null;
    referral_code: string;
    xp: number;
    referral_count: string;
  }>(
    `
      select
        users.current_streak,
        users.last_check_in_date::text,
        users.referral_code,
        users.xp,
        (
          select count(*)
          from public.users as referred_users
          where referred_users.referred_by_telegram_id = users.telegram_id
        )::text as referral_count
      from public.users as users
      where users.telegram_id = $1
    `,
    [user.telegramId],
  );

  const currentUser = result.rows[0];

  if (!currentUser) {
    throw new Error("User not found.");
  }

  const today = getTodayUtc();
  const currentStreak = getEffectiveStreak(
    currentUser.last_check_in_date || undefined,
    currentUser.current_streak,
  );

  return {
    currentStreak,
    checkedInToday: currentUser.last_check_in_date === today,
    referralCode: currentUser.referral_code,
    referralCount: Number(currentUser.referral_count),
    referralLink: `${origin}/?ref=${currentUser.referral_code}`,
    xp: currentUser.xp,
  };
}

export async function claimDailyCheckIn(user: AuthenticatedAppUser) {
  const mode = await resolveStorageMode();

  if (mode === "local") {
    return mutateLocalStore((store) => {
      const currentUser = store.users.find((entry) => entry.telegramId === user.telegramId);

      if (!currentUser) {
        throw new Error("User not found.");
      }

      const today = getTodayUtc();

      if (currentUser.lastCheckInDate === today) {
        throw new Error("Daily check-in already claimed today.");
      }

      const previousDay = getPreviousUtcDay(today);
      const nextStreak =
        currentUser.lastCheckInDate === previousDay ? currentUser.currentStreak + 1 : 1;

      currentUser.currentStreak = nextStreak;
      currentUser.lastCheckInDate = today;
      currentUser.xp += 10;

      return {
        currentStreak: currentUser.currentStreak,
        checkedInToday: true,
        xp: currentUser.xp,
      };
    });
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");

    const result = await client.query<{
      current_streak: number;
      last_check_in_date: string | null;
      xp: number;
    }>(
      `
        select current_streak, last_check_in_date::text, xp
        from public.users
        where telegram_id = $1
        for update
      `,
      [user.telegramId],
    );

    const currentUser = result.rows[0];

    if (!currentUser) {
      throw new Error("User not found.");
    }

    const today = getTodayUtc();

    if (currentUser.last_check_in_date === today) {
      throw new Error("Daily check-in already claimed today.");
    }

    const previousDay = getPreviousUtcDay(today);
    const nextStreak =
      currentUser.last_check_in_date === previousDay ? currentUser.current_streak + 1 : 1;

    const updated = await client.query<{
      current_streak: number;
      xp: number;
    }>(
      `
        update public.users
        set
          current_streak = $2,
          last_check_in_date = $3::date,
          xp = xp + 10,
          updated_at = now()
        where telegram_id = $1
        returning current_streak, xp
      `,
      [user.telegramId, nextStreak, today],
    );

    await client.query("commit");

    return {
      currentStreak: updated.rows[0].current_streak,
      checkedInToday: true,
      xp: updated.rows[0].xp,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
