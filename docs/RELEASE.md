# Release candidate checklist

This document is a **manual** launch checklist for the content studio. Items are unchecked unless a human has actually performed them. Automated checks in CI or a local `pytest`/`npm` run do **not** mark live AI, browser, or Supabase items complete.

The product is a **release candidate** only after automated checks pass **and** the critical manual rows below are done. It is not production-ready until deployment, secrets, and operational requirements are verified in the target environment.

Do not deploy, change production data, or publish social posts from this app. There is no posting or scheduling feature.

## Environment

- [ ] `web/.env.local` has `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (browser-safe only).
- [ ] Repo-root `.env` has `SUPABASE_URL` for JWKS JWT verification.
- [ ] Repo-root `.env` has `SUPABASE_ANON_KEY` (anon/public key, **not** the service role) so FastAPI can load owned brand/pillar rows.
- [ ] `SUPABASE_JWT_SECRET` set only if the project still issues HS256 tokens.
- [ ] `OPENAI_API_KEY` on the Python API only (not `NEXT_PUBLIC_*`).
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is **not** present in any `NEXT_PUBLIC_*` variable or client bundle.
- [ ] `API_BASE_URL` / `NEXT_PUBLIC_API_BASE_URL` point at the FastAPI process used by the UI.
- [ ] `CORS_ORIGINS` includes the deployed Next.js origin if the API is on another host.

See [SETUP.md](SETUP.md) for how each variable is used.

## Schema and RLS

Apply these SQL files in order in the Supabase SQL editor (the app does not apply them):

1. `supabase/migrations/20241028000000_init_content_studio.sql`
2. `supabase/migrations/20241028000001_brand_onboarding.sql`
3. `supabase/migrations/20241028000002_content_item_drafts.sql`
4. `supabase/migrations/20241028000003_content_ideas.sql`
5. `supabase/migrations/20241028000004_content_plan_items.sql`
6. `supabase/migrations/20241028000005_content_pillars.sql`

- [ ] All six migrations applied on the target project.
- [ ] Auth → Email provider enabled.
- [ ] Redirect URL includes `{origin}/auth/callback`.
- [ ] RLS: a second test user cannot read another user’s `brands`, `content_items`, `content_ideas`, `content_plan_items`, or `content_pillars`.

## Processes

- [ ] `GET http://127.0.0.1:8000/health` (or deployed API health) returns `ok` and `publishes_to_social: false` without secrets in the body.
- [ ] `make dev-api` and `make dev-web` (or production equivalents) start without missing-module errors.
- [ ] Next.js build succeeds (`cd web && npm run build`).
- [ ] Do **not** run `python app.py` for the studio (legacy Flask still publishes).

## Automated checks (local)

Record the date and outcome when you run them. Do not tick from memory.

- [ ] `./venv/bin/pytest -q`
- [ ] `cd web && npm run test`
- [ ] `cd web && npm run typecheck`
- [ ] `cd web && npm run lint`
- [ ] `cd web && npm run build`

## Authentication and ownership

- [ ] Sign up / sign in with email.
- [ ] Unauthenticated visit to `/studio` redirects to login.
- [ ] FastAPI `/v1/content/generate` without `Authorization` returns 401.
- [ ] Drafts, ideas, planner slots, and pillars belong only to the signed-in user.
- [ ] Live: `/v1/content/generate` with user A’s JWT and user B’s `brand.id` returns 404 without B’s brand name. Automated pytest mocks this path; do not tick from unit tests alone.
- [ ] Live: generate with an owned brand id and optional owned pillar id still writes a draft. Forged `brand.name` in the JSON does not appear in the model prompt (check API behaviour / output, not unit tests only).

## Live AI (requires OpenAI)

- [ ] Generate a draft **with** an explicit pillar and **without** a pillar.
- [ ] Save, reopen, edit, save again.
- [ ] Refine / alternatives / hooks: apply is explicit; save writes the chosen text.
- [ ] Repurpose creates a **new** row; original platform unchanged.
- [ ] Quality review evaluates the **saved** draft text, not an unsaved alternative.
- [ ] Idea discovery saves to the idea bank; create-from-idea preserves topic.
- [ ] Model failure does not overwrite a previously saved draft.

## Studio workflows

- [ ] Brand onboarding and `/studio/brand` edit.
- [ ] Content pillars CRUD; deleted pillar still shows snapshot on older drafts.
- [ ] Create, drafts library (search, filters, sort, duplicate, confirmed delete).
- [ ] Weekly planner: slot drafted only after save; not a publish calendar.
- [ ] Strategy page counts drafts/pillars only (no engagement claims).
- [ ] Unsaved editor changes: leave warning; back to drafts; continue last draft.
- [ ] Keyboard: skip link, focus rings on primary controls, studio nav current page.

## Known limitations (do not treat as completed work)

- FastAPI brand/pillar ownership tests in pytest **mock** PostgREST. Live RLS for API lookups is a separate manual check.
- `/health` `studio_context_configured` is false until `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set on the API. Generation that sends a brand or pillar id then fails closed (503).
- Draft library search/filter is client-side over the owned list (bounded page size 40).
- No archive status (`content_items.status` is `draft` or `ready` only).
- Preferred platform lives in `brands.voice_preferences` JSON; optional.
- Legacy Flask publishing modules remain in the repo and must stay unused by the studio.
- This checklist does not certify production hosting, backups, or uptime.

## Rollback

- Revert the Next.js/FastAPI deploy; database migrations are additive and are not auto-reverted.
- Removing a draft does not delete planner ideas; `draft_id` on plan items is `ON DELETE SET NULL`.
