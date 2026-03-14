create table if not exists public.task_claims (
  id bigserial primary key,
  telegram_id bigint not null references public.users(telegram_id) on delete cascade,
  task_type text not null,
  claimed_at timestamptz not null default now()
);

create index if not exists task_claims_user_task_claimed_idx
on public.task_claims (telegram_id, task_type, claimed_at desc);
