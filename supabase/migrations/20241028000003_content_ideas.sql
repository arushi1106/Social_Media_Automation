-- Phase 5: persistent content idea bank.
-- Owner-only RLS via auth.uid() = user_id. Does not publish anywhere.
-- Apply in the Supabase SQL editor after the Phase 1–3 migrations.

create table if not exists public.content_ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  brand_id uuid references public.brands (id) on delete set null,
  title text not null,
  concept text not null,
  platform text check (platform is null or platform in ('linkedin', 'instagram')),
  format text check (format is null or format in ('text_post', 'caption', 'carousel', 'script')),
  status text not null default 'saved' check (status in ('saved', 'used')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_ideas_user_updated_idx
  on public.content_ideas (user_id, updated_at desc);

create index if not exists content_ideas_user_status_idx
  on public.content_ideas (user_id, status);

drop trigger if exists content_ideas_set_updated_at on public.content_ideas;
create trigger content_ideas_set_updated_at
  before update on public.content_ideas
  for each row execute function public.set_updated_at();

alter table public.content_ideas enable row level security;

drop policy if exists "content_ideas_all_own" on public.content_ideas;
create policy "content_ideas_all_own"
  on public.content_ideas for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table public.content_ideas is 'Saved AI topic suggestions. Not posts. Never auto-published.';
comment on column public.content_ideas.metadata is 'JSON: why_relevant, angle, hook, call_to_action, pillar, objective, theme.';
comment on column public.content_ideas.status is 'saved | used. used only after the user saves a draft from the idea.';
