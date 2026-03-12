alter table public.users
add column if not exists xp integer not null default 0;

create table if not exists public.card_votes (
  id bigserial primary key,
  card_id bigint not null references public.cards(id) on delete cascade,
  voter_telegram_id bigint not null references public.users(telegram_id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (card_id, voter_telegram_id)
);

create index if not exists card_votes_card_id_idx on public.card_votes (card_id);
