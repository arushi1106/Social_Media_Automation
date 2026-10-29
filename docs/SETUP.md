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

Fill `OPENAI_API_KEY` and `SUPABASE_URL` (Project Settings → API → Project URL). New Supabase projects sign user access tokens with **ES256**; the API verifies them using `https://<project>.supabase.co/auth/v1/.well-known/jwks.json`. Set `SUPABASE_JWT_SECRET` only if Authentication → Signing Keys still shows legacy HMAC (HS256) tokens.

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
6. Confirm Auth → Providers → Email is enabled for local testing

The migrations create `profiles`, `brands`, `content_sources`, `content_items`, `content_ideas`, and `content_plan_items` with ownership indexes and row-level security. They do not migrate MongoDB or `instance/demo.db`. This repository does not apply migrations to your Supabase project automatically.

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
| `SUPABASE_URL` | Python API JWKS verification of ES256 access tokens (current Supabase signing keys) |
| `SUPABASE_JWT_SECRET` | Only if the project still issues legacy HS256 JWTs |
| `OPENAI_API_KEY` | Draft generation, refinement, alternatives, repurpose, topic ideas, and quality review (`POST /v1/content/generate`, `/refine`, `/variations`, `/repurpose`, `/ideas`, `/review`) |
| Email auth in Supabase | Creating accounts |

Source extraction (`POST /v1/sources/extract`) does not need OpenAI. It will fail on sites that block unauthenticated scraping; that is expected.
