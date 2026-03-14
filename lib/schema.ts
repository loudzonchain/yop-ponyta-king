import { getPool } from "@/lib/db";
import {
  getSchemaReadyState,
  getStorageModeState,
  setSchemaReadyState,
  setStorageModeState,
} from "@/lib/local-store";

export async function resolveStorageMode() {
  const currentMode = getStorageModeState();

  if (currentMode) {
    return currentMode;
  }

  try {
    const pool = getPool();
    await pool.query("select 1");
    setStorageModeState("database");
  } catch {
    setStorageModeState("local");
  }

  return getStorageModeState();
}

export async function ensureCardSchema() {
  const mode = await resolveStorageMode();

  if (mode === "local" || getSchemaReadyState()) {
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

  setSchemaReadyState(true);
}
