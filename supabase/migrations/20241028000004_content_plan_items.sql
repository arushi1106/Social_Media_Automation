-- Phase 6: weekly content planning board.
-- Planning dates are intended writing days, not publish times.
-- Owner-only RLS via auth.uid() = user_id. Does not publish or schedule posts.
-- Apply in the Supabase SQL editor after the Phase 5 content_ideas migration.

create table if not exists public.content_plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  brand_id uuid references public.brands (id) on delete set null,
  idea_id uuid not null references public.content_ideas (id) on delete cascade,
  draft_id uuid references public.content_items (id) on delete set null,
  week_start date not null,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  notes text not null default '',
  status text not null default 'planned' check (status in ('planned', 'drafted', 'skipped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idea_id, week_start)
);

create index if not exists content_plan_items_user_week_idx
  on public.content_plan_items (user_id, week_start, day_of_week);

drop trigger if exists content_plan_items_set_updated_at on public.content_plan_items;
create trigger content_plan_items_set_updated_at
  before update on public.content_plan_items
  for each row execute function public.set_updated_at();

alter table public.content_plan_items enable row level security;

drop policy if exists "content_plan_items_all_own" on public.content_plan_items;
create policy "content_plan_items_all_own"
  on public.content_plan_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table public.content_plan_items is 'Weekly writing plan slots. Not a publish calendar.';
comment on column public.content_plan_items.week_start is 'Monday (ISO date) of the planned week.';
comment on column public.content_plan_items.day_of_week is '0=Monday … 6=Sunday.';
comment on column public.content_plan_items.status is 'planned | drafted | skipped. drafted only after a draft is saved from this slot.';
