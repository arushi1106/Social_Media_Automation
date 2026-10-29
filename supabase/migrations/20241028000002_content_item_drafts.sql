-- Phase 3: draft format and topic on existing content_items.
-- RLS on public.content_items is unchanged (owner-only via auth.uid() = user_id).
-- Apply in the Supabase SQL editor after the Phase 1 and Phase 2 migrations.

alter table public.content_items
  add column if not exists format text not null default 'text_post';

alter table public.content_items
  add column if not exists topic text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'content_items_format_check'
  ) then
    alter table public.content_items
      add constraint content_items_format_check
      check (format in ('text_post', 'caption', 'carousel', 'script'));
  end if;
end
$$;

create index if not exists content_items_user_updated_idx
  on public.content_items (user_id, updated_at desc);

comment on column public.content_items.format is 'text_post | caption | carousel | script';
comment on column public.content_items.topic is 'User brief or topic used to generate the draft.';
comment on column public.content_items.metadata is 'JSON: generation inputs and structured output (slides, script, hashtags).';
comment on column public.content_items.body is 'Primary editable text. Does not publish anywhere.';
