create table if not exists public.cards (
  id bigserial primary key,
  author_telegram_id bigint not null references public.users(telegram_id) on delete cascade,
  caption varchar(280) not null,
  image_url text not null,
  created_at timestamptz not null default now()
);

create index if not exists cards_created_at_idx on public.cards (created_at desc);
