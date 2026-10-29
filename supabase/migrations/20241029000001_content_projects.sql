-- Phase 10: content projects / briefs for grouping ideas and drafts.
-- Planning dates are targets only. Not a publish calendar.
-- Owner-only RLS via auth.uid() = user_id.
-- Apply after the content templates migration. The app does not apply this automatically.

create table if not exists public.content_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  name text not null,
  objective text not null default '',
  audience text not null default '',
  core_message text not null default '',
  offer text not null default '',
  desired_action text not null default '',
  pillar_id uuid references public.content_pillars (id) on delete set null,
  platforms text[] not null default '{}'::text[],
  tone text not null default '',
  plan_start date,
  plan_end date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_projects_name_len check (char_length(btrim(name)) between 1 and 80),
  constraint content_projects_text_len check (
    char_length(objective) <= 400
    and char_length(audience) <= 400
    and char_length(core_message) <= 400
    and char_length(offer) <= 400
    and char_length(desired_action) <= 300
    and char_length(tone) <= 200
  )
);

create index if not exists content_projects_user_updated_idx
  on public.content_projects (user_id, updated_at desc);

drop trigger if exists content_projects_set_updated_at on public.content_projects;
create trigger content_projects_set_updated_at
  before update on public.content_projects
  for each row execute function public.set_updated_at();

alter table public.content_projects enable row level security;

drop policy if exists "content_projects_all_own" on public.content_projects;
create policy "content_projects_all_own"
  on public.content_projects for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table public.content_projects is 'Content briefs that group ideas and drafts. Not a publishing or scheduling queue.';
comment on column public.content_projects.plan_start is 'Optional planning start date. Not a social publish time.';
comment on column public.content_projects.plan_end is 'Optional planning end date. Not a social publish time.';
