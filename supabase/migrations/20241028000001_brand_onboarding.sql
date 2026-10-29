-- Phase 2: structured brand preferences. Forward-only; does not rewrite the init migration.
-- Row Level Security on public.brands is unchanged (owner-only via auth.uid() = user_id).

alter table public.brands
  add column if not exists niche text,
  add column if not exists bio text,
  add column if not exists audience text,
  add column if not exists language text not null default 'English',
  add column if not exists platforms text[] not null default '{}'::text[],
  add column if not exists goals text[] not null default '{}'::text[],
  add column if not exists topics text[] not null default '{}'::text[];

comment on column public.brands.platforms is 'Structured platform slugs, e.g. linkedin, instagram.';
comment on column public.brands.goals is 'Structured content goal slugs.';
comment on column public.brands.topics is 'Freeform topic strings the creator wants to cover.';
comment on column public.brands.voice_preferences is 'JSON: tone, customTone, writingStyle, avoid.';

-- One saved brand per user so onboarding retries update instead of duplicating.
create unique index if not exists brands_one_per_user_idx on public.brands (user_id);
