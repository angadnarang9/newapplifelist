-- LifeList – Supabase schema
-- Run this once in your Supabase project's SQL editor.
-- Each user gets one row holding their LifeList data as JSON.
-- Row Level Security guarantees users can only ever read/write their own row.

create table if not exists public.lifelist_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.lifelist_data enable row level security;

drop policy if exists "Users read own data"   on public.lifelist_data;
drop policy if exists "Users insert own data" on public.lifelist_data;
drop policy if exists "Users update own data" on public.lifelist_data;
drop policy if exists "Users delete own data" on public.lifelist_data;

create policy "Users read own data"   on public.lifelist_data for select using (auth.uid() = user_id);
create policy "Users insert own data" on public.lifelist_data for insert with check (auth.uid() = user_id);
create policy "Users update own data" on public.lifelist_data for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users delete own data" on public.lifelist_data for delete using (auth.uid() = user_id);
