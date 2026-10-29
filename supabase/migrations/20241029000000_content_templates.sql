-- Phase 9: user-owned reusable content structures.
-- Distinct from system catalog templates, which live in application code.
-- Owner-only RLS via auth.uid() = user_id. Does not publish or generate posts.
-- Apply in the Supabase SQL editor after the content pillars migration.

create table if not exists public.content_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  name text not null,
  description text not null,
  category text not null,
  content_format text not null check (content_format in ('text_post', 'caption', 'carousel', 'script')),
  platform text check (platform is null or platform in ('linkedin', 'instagram')),
  structure jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_templates_name_len check (char_length(btrim(name)) between 1 and 80),
  constraint content_templates_description_len check (char_length(btrim(description)) between 1 and 400),
  constraint content_templates_category_len check (char_length(btrim(category)) between 1 and 40)
);

create unique index if not exists content_templates_user_lower_name_idx
  on public.content_templates (user_id, lower(btrim(name)));

create index if not exists content_templates_user_updated_idx
  on public.content_templates (user_id, updated_at desc);

drop trigger if exists content_templates_set_updated_at on public.content_templates;
create trigger content_templates_set_updated_at
  before update on public.content_templates
  for each row execute function public.set_updated_at();

alter table public.content_templates enable row level security;

drop policy if exists "content_templates_all_own" on public.content_templates;
create policy "content_templates_all_own"
  on public.content_templates for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table public.content_templates is 'Reusable writing structures owned by a user. Not posts. Never auto-published.';
comment on column public.content_templates.platform is 'Optional platform hint. Null means any of the brand platforms.';
comment on column public.content_templates.structure is 'JSON: sections[], hook, body, cta, suggestedLength. User-authored generation guidance.';
