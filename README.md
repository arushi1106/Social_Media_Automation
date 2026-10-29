# Content Studio MVP

AI-powered draft studio for creators and personal brands. It stores brand voice, suggests topics, plans a writing week, generates LinkedIn and Instagram drafts, lets you review and rewrite them, and does **not** auto-publish.

This repository started as a Flask automation script (`app.py`) that scraped Google News, called OpenAI, then published. That code is preserved. The product path is:

- `web/` — Next.js App Router UI (auth, brand onboarding, studio shell)
- `api/` — FastAPI extraction + generation
- `supabase/migrations/` — Postgres schema and RLS

See [ARCHITECTURE.md](ARCHITECTURE.md) and [docs/SETUP.md](docs/SETUP.md).

```bash
make install-api
make install-web
make dev-api   # http://127.0.0.1:8000/health
make dev-web   # http://localhost:3000
make test
```
