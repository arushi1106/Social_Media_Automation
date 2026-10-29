# Setup

The studio is two processes: a Next.js UI and a Python API that reuses source extraction from `scraping.py`. Automatic LinkedIn/Instagram publishing is not part of this app.

## Prerequisites

- Python 3.10+
- Node.js 20+
- A [Supabase](https://supabase.com) project (Auth + Postgres)
- An OpenAI API key (generation only; extraction works without it)

Credentials are not included in this repository. Until they are set, the UI still loads and the API `/health` endpoint reports which services are configured.

## 1. Python API

From the repository root:

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Fill `OPENAI_API_KEY`, `SUPABASE_URL` (Project Settings → API → Project URL), and `SUPABASE_ANON_KEY` (the same anon/public key as `NEXT_PUBLIC_SUPABASE_ANON_KEY`, not the service role). New Supabase projects sign user access tokens with **ES256**; the API verifies them using `https://<project>.supabase.co/auth/v1/.well-known/jwks.json`. Set `SUPABASE_JWT_SECRET` only if Authentication → Signing Keys still shows legacy HMAC (HS256) tokens.

The API forwards the authenticated user JWT plus `SUPABASE_ANON_KEY` to PostgREST when a request includes a brand or pillar id, so row-level security decides which profile text is used. Do not put `SUPABASE_SERVICE_ROLE_KEY` in the Python API for this lookup.

```bash
make dev-api
```

The API listens on `http://127.0.0.1:8000`. Check `GET /health`.

Do **not** run `python app.py` for the studio. That legacy Flask route still generates posts and then calls Instagram publishing in a loop.

## 2. Database

In the Supabase SQL editor (or `supabase db push` if the CLI is linked):

1. Run `supabase/migrations/20241028000000_init_content_studio.sql`
2. Run `supabase/migrations/20241028000001_brand_onboarding.sql` (adds structured brand fields and one brand per user)
3. Run `supabase/migrations/20241028000002_content_item_drafts.sql` (adds `format` and `topic` on `content_items` for saved drafts)
4. Run `supabase/migrations/20241028000003_content_ideas.sql` (creates `content_ideas` with owner-only RLS for the idea bank)
5. Run `supabase/migrations/20241028000004_content_plan_items.sql` (weekly planner slots; owner-only RLS)
6. Run `supabase/migrations/20241028000005_content_pillars.sql` (named brand content pillars; owner-only RLS)
7. Confirm Auth → Providers → Email is enabled for local testing

The migrations create `profiles`, `brands`, `content_sources`, `content_items`, `content_ideas`, `content_plan_items`, and `content_pillars` with ownership indexes and row-level security. They do not migrate MongoDB or `instance/demo.db`. This repository does not apply migrations to your Supabase project automatically.

### Brand onboarding

After sign-in, open `/onboarding` (or use the studio empty state). Preferences save to `public.brands` with `user_id` taken from the Supabase session, not from the browser form. Row-level security still limits each user to their own row. Saving twice updates the same brand (`upsert` on `user_id`). Edit later at `/studio/brand`.

If save fails with a foreign-key error, the Auth trigger has not created `profiles` yet: sign out and sign in again, or apply the init migration so `handle_new_user` exists.

### Content drafts (Phase 3)

After a brand is saved, open `/studio/create`. The Next.js server loads the brand via RLS, then calls `POST /v1/content/generate` with the user JWT. OpenAI keys stay on the Python API. Saved drafts go to `public.content_items` (owner-only RLS). There is no publishing.

Generation needs `OPENAI_API_KEY` and `SUPABASE_URL` in the repo-root `.env` (plus `SUPABASE_JWT_SECRET` only for legacy HS256), and both `make dev-api` and `make dev-web` running. After changing `.env`, restart `make dev-api`.

### Refine and repurpose (Phase 4)

Open a saved draft at `/studio/drafts/[id]`. Rewrite actions, three alternatives, and “Repurpose content” call the same FastAPI app (`/v1/content/refine`, `/variations`, `/repurpose`) with the session JWT and the brand loaded server-side. A successful rewrite is **not** written to the database until you apply it and click save. Saving a repurposed version inserts a **new** `content_items` row; the source draft and platform stay unchanged. No new environment variables or migrations.

Manual check: generate a LinkedIn post, save it, open the draft, run “Make it shorter”, confirm the editor still shows the original until you apply, save, then repurpose to Instagram caption and confirm two rows exist in Drafts.

### Topic ideas (Phase 5)

After the `content_ideas` migration is applied, open `/studio/ideas`. Discovery calls `POST /v1/content/ideas` with the session JWT and the saved brand. Results are labelled as suggestions, not performance predictions. Saving an idea writes to `public.content_ideas` (owner-only RLS). “Create draft from idea” opens `/studio/create?idea=…` with the existing generate form; the idea is marked `used` only after you save a draft. No new environment variables.

This migration has **not** been applied by the app itself. Run it in the Supabase SQL editor, then confirm `/studio/ideas` can save a row.

### Weekly planner (Phase 6)

After `20241028000004_content_plan_items.sql` is applied, open `/studio/planner`. Assign saved ideas to weekdays. “Create draft” reuses `/studio/create?idea=…&plan=…`. A slot is marked **drafted** only after you save a draft. Removing a slot does not delete the idea. This is not a posting or scheduling calendar. No new environment variables.

The planner migration is **not** applied by the app. Run it in the Supabase SQL editor before using the board.

### Quality review (Phase 7)

On a saved draft (`/studio/drafts/[id]`), use **Review content**. The Next.js server calls `POST /v1/content/review` with the saved draft, session JWT, and brand profile. The overall score is a weighted average of applicable dimensions (clarity 18, hook 16, value 16, audience 14, voice 14, platform fit 12, CTA 10). Missing brand fields are excluded rather than scored as failures. The review is advisory and does not predict engagement. Improvement actions reuse the existing refine panel. No new tables or environment variables.

### Content pillars (Phase 8.1)

After `20241028000005_content_pillars.sql` is applied, open `/studio/brand`. **Content pillars** sit below the brand wizard. Each pillar has a name and description (max 8). Owner id comes from the session; RLS is `auth.uid() = user_id`. This is separate from optional `brands.topics` keywords. Saving, editing, or deleting a pillar does not generate or publish posts. No new environment variables.

The pillars migration is **not** applied by the app. Run it in the Supabase SQL editor, then confirm a pillar survives a page refresh.

### Strategy-aware generation (Phase 8.2)

On `/studio/create`, optionally select one saved pillar. The Next.js server loads that row with the session (`auth.uid()` + brand id) and sends its id, name, and description to the existing `POST /v1/content/generate` endpoint. FastAPI ignores name/description unless an id is present. Topic keywords and the full brand profile are unchanged. If you pick no pillar, generation matches Phase 3. If the selected pillar was deleted, generate fails with a field error instead of substituting another pillar.

No new migration: the selected pillar id and a name/description snapshot are stored on `content_items.metadata.inputs`. Refine, alternatives, and repurpose reuse that snapshot when present; older drafts without a pillar are not assigned one. This does not publish or schedule posts.

### Content strategy (Phase 8.3)

After pillars and at least some drafts exist, open `/studio/strategy`. The page counts your saved `content_pillars` and `content_items` (unique draft rows). Mix uses the Phase 8.2 metadata snapshot; it does not guess from topics or Idea Bank free-text pillar labels. Recommendations are deterministic counts with links to Create (`?pillar=` loaded via RLS), Idea Bank, and Brand settings. No new tables, environment variables, or publishing.

### Variations and hooks (Phase 8.4)

On a saved draft, **Generate three alternatives** still calls `POST /v1/content/variations` (optional `angle`: educational, storytelling, opinion, practical, question, mixed, or distinct). **Generate opening hooks** calls `POST /v1/content/hooks` and returns four openings only. Results stay on the page until you select and apply them, then save. Comparison copy is a wording summary, not a performance forecast. Quality review scores remain tied to the last saved draft. No new tables or environment variables. This does not publish.

### Draft library (Phase 8.5)

`/studio/drafts` searches title, topic, body, and pillar snapshot locally after loading owned `content_items`. Filters use platform, format, status (`draft` | `ready`), and pillar (live id, unassigned, or removed snapshot). Duplicate inserts a new owned row; delete asks for confirmation. Planner `draft_id` is `on delete set null`. No new tables, search service, or archive status.

### Workflow polish (Phase 8.6)

Brand settings can store an optional default platform in existing `voice_preferences` JSON (no migration). New drafts use it only when the platform is on the brand and the user did not arrive from an idea, planner slot, or other explicit form. Content pillars are still never auto-selected. Opening a draft remembers it in session storage for “Continue last draft” on the studio overview. No new environment variables.

### Reliability notes (Phase 8.7)

Generation is limited to **8 requests per authenticated user per 60 seconds** on the Python API. `/health` reports configuration flags, not secrets. CORS allows GET/POST/OPTIONS from `CORS_ORIGINS` (default localhost:3000).

### Brand and pillar ownership (Phase 8.9)

**Trust boundary:** User identity comes from a verified JWT (`sub`). Next.js still loads owned rows for the UI, but FastAPI does not trust client-supplied brand or pillar *text*. For `/v1/content/generate`, `/refine`, `/variations`, `/hooks`, `/repurpose`, `/ideas`, and `/review`, any referenced brand or pillar id is loaded from PostgREST with the **user JWT** and `SUPABASE_ANON_KEY`. Stored `brands` and `content_pillars` rows (owner `user_id`, pillar `brand_id`) replace the payload. Forged names and descriptions are ignored. Missing, cross-user, or cross-brand ids return a generic 404 (`That content context is not available.`). Lookup failures return 503 and do not generate. Name-only pillar objects (no id) are ignored and are not used as prompt context. Topic, extra instructions, and source draft text remain user-authored inputs.

Automated tests mock PostgREST. They do not prove live RLS. After setting `SUPABASE_ANON_KEY` on the API, confirm `/health` has `studio_context_configured: true`, then try generate with another user’s brand id (expect 404, no leak of their name).

Do not put `SUPABASE_SERVICE_ROLE_KEY` in `NEXT_PUBLIC_*` variables.

## 3. Next.js UI

```bash
cd web
cp ../.env.example .env.local
```

Set at least:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_URL=http://127.0.0.1:8000`

```bash
npm install
npm run dev
```

Or from the repo root: `make install-web` then `make dev-web`.

Open `http://localhost:3000`. Sign-up/sign-in talks to Supabase Auth. It will fail until the public URL and anon key are present.

In the Supabase dashboard, add `http://localhost:3000/auth/callback` to Authentication → URL Configuration → Redirect URLs so email confirmation can create a session.

## 4. Checks

```bash
make test
make typecheck
```

## Remaining configuration

| Variable | Required for |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Login, RLS data access |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Login, RLS data access |
| `SUPABASE_URL` | Python API JWKS verification of ES256 access tokens, and PostgREST brand/pillar lookups |
| `SUPABASE_ANON_KEY` | Python API PostgREST lookups under the user JWT (same value as `NEXT_PUBLIC_SUPABASE_ANON_KEY`; never the service role) |
| `SUPABASE_JWT_SECRET` | Only if the project still issues legacy HS256 JWTs |
| `OPENAI_API_KEY` | Draft generation, refinement, alternatives, hooks, repurpose, topic ideas, and quality review (`POST /v1/content/generate`, `/refine`, `/variations`, `/hooks`, `/repurpose`, `/ideas`, `/review`) |
| Email auth in Supabase | Creating accounts |

Source extraction (`POST /v1/sources/extract`) does not need OpenAI. It will fail on sites that block unauthenticated scraping; that is expected.

Manual launch steps and an unchecked verification list live in [RELEASE.md](RELEASE.md). Do not treat this app as production-ready until those items are actually performed.
