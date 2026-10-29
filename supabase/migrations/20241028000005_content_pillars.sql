-- Phase 8.1: brand content pillars (name + short theme description).
-- Distinct from brands.topics, which remains a freeform string list.
-- Owner-only RLS via auth.uid() = user_id. Does not publish or generate posts.
-- Apply in the Supabase SQL editor after the Phase 6 planner migration.

create table if not exists public.content_pillars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  name text not null,
  description text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_pillars_name_len check (char_length(btrim(name)) between 1 and 80),
  constraint content_pillars_description_len check (char_length(btrim(description)) between 1 and 400)
);

create unique index if not exists content_pillars_user_lower_name_idx
  on public.content_pillars (user_id, lower(btrim(name)));

create index if not exists content_pillars_user_updated_idx
  on public.content_pillars (user_id, updated_at desc);

drop trigger if exists content_pillars_set_updated_at on public.content_pillars;
create trigger content_pillars_set_updated_at
  before update on public.content_pillars
  for each row execute function public.set_updated_at();

alter table public.content_pillars enable row level security;

drop policy if exists "content_pillars_all_own" on public.content_pillars;
create policy "content_pillars_all_own"
  on public.content_pillars for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table public.content_pillars is 'Recurring content themes for a brand. Not posts. Never auto-published.';
comment on column public.content_pillars.name is 'Short pillar name, unique per user ignoring case.';
comment on column public.content_pillars.description is 'What this theme covers for future planning and generation context.';
