create table if not exists public.users (
  id bigserial primary key,
  telegram_id bigint not null unique,
  username text,
  first_name text not null,
  last_name text,
  display_name text not null,
  language text not null default 'en' check (language in ('en', 'ja')),
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists users_language_idx on public.users (language);
