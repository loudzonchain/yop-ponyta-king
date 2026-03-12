alter table public.users
add column if not exists current_streak integer not null default 0;

alter table public.users
add column if not exists last_check_in_date date;

alter table public.users
add column if not exists referral_code text;

alter table public.users
add column if not exists referred_by_telegram_id bigint references public.users(telegram_id) on delete set null;

update public.users
set referral_code = coalesce(referral_code, concat('ref_', telegram_id::text))
where referral_code is null;

create unique index if not exists users_referral_code_idx on public.users (referral_code);
