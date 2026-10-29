# Architecture and migration plan

Phase 1 foundation for an AI content studio, derived from the current Social Media Automation code rather than a greenfield rewrite.

## What exists today

| Area | Current state |
| --- | --- |
| Framework | Flask 3 (`app.py`) with a single `GET /` route |
| Entry point | `python app.py` → `app.run(debug=True)` |
| Python deps | Flask, OpenAI 1.x, pymongo, GoogleNews, BeautifulSoup, pandas, requests, Flask-SQLAlchemy (unused in code) |
| Database | MongoDB via hardcoded `MongoClient("connection")` in `gpt.py` (placeholder). SQLite `instance/demo.db` has an unused `demo(Serial, title, desc, date_created)` table from an earlier Flask-SQLAlchemy experiment |
| Env config | None. API keys and tokens are inline placeholders (`openAI_api_key`, `linkedin_access_token`, `meta_long_live_access_token`, `pexels_api_key`) |
| Frontend | None |
| Auth | None |

### Current workflow (do not use for the MVP)

1. Search Google News for the hardcoded query `GenAI`.
2. Strip URL tracking parameters (`scraping.strip_after_character`).
3. Fetch title + paragraph text (`scraping.scrape_data`).
4. Call OpenAI `gpt-3.5-turbo` (`gpt.ai`) with a two-paragraph blogger prompt.
5. Deduplicate by URL in MongoDB, write `titles.csv`.
6. **Publish immediately**: `linkedin.share()` from `gpt.ai`, then `insta.main()` which loops Instagram Graph publishes every 60 seconds.

Automatic LinkedIn/Instagram publishing is **out of scope** for this product. Those modules remain in the repo for reference and are not imported by the new application path.

## Target architecture

```
Browser (Next.js App Router)
  └─ Supabase Auth (anon key, user JWT)
  └─ Supabase Postgres (RLS, user-owned drafts)
  └─ Python API (Bearer JWT)
        ├─ scraping.py (source extraction)
        └─ generation service (OpenAI generate / refine / review / ideas, no publish)
```

Secrets (`OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, DB URLs) stay on the server. The browser only receives `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

### Layout

- `app.py`, `gpt.py`, `scraping.py`, `linkedin.py`, `insta.py` — legacy automation (preserved)
- `api/` — FastAPI boundary used by the studio
- `web/` — Next.js App Router UI
- `supabase/migrations/` — Postgres schema, indexes, RLS
- `docs/SETUP.md` — local setup

### Data model (Phase 1)

- `profiles` — 1:1 with `auth.users`
- `brands` — owned by a profile (unique `user_id`); identity columns plus `platforms`/`goals`/`topics` arrays; `voice_preferences` JSON (tone, customTone, writingStyle, avoid)
- `content_sources` — extracted URLs/text owned by a profile
- `content_items` — platform-specific drafts, optional brand + source FKs
- `content_ideas` — saved topic suggestions (owner-only RLS); not posts
- `content_plan_items` — weekly writing slots linking an idea to a weekday; not a publish calendar

## Migration steps (phased)

1. **Phase 1 (this work)** — Audit, Next.js shell, Supabase schema + auth wiring, Python API without publishing, docs and env templates.
2. **Phase 2** — Onboarding: account, profile, first brand and voice preferences (one `brands` row per user; structured platforms/goals/topics).
3. **Phase 3** — Content studio: brand-aware OpenAI drafts (LinkedIn/Instagram), edit/save via `content_items` RLS. No auto-publish.
4. **Phase 4** — Refine, three alternatives, and cross-platform repurpose in the existing draft editor. Results stay local until the user applies and saves. Repurposed work is a new `content_items` row. No auto-publish. No new tables.
5. **Phase 5** — Brand-aware topic discovery and a persistent idea bank (`content_ideas`). Create draft from an idea reuses Phase 3 generation. Still no auto-publish.
6. **Phase 6** — Weekly content planner (`/studio/planner`, `content_plan_items`). Organise saved ideas by weekday and track planned → drafted. Still no auto-publish or scheduling.
7. **Phase 7** — Advisory quality review on saved drafts (`POST /v1/content/review`). Weighted scorecard; does not replace refine and does not predict performance. Still no auto-publish.
8. **Later** — Optional extras only after review is reliable. Still no auto-publish.

## Explicit non-goals

- Invoking `linkedin.share` or `insta.main` from the studio
- Claiming OpenAI, Supabase, LinkedIn, Instagram, Pexels, or MongoDB work without credentials
- Replacing the existing Python files with an unrelated scaffold
