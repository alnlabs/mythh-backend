# MYTHH Backend

API for [MYTHH](https://mythh.in) — a swipe-based myth discovery platform.

This service uses Express and [@supabase/server](https://github.com/supabase/server) to verify Supabase Auth JWTs and create request-scoped clients.

## Requirements

- Node.js 22+
- A Supabase project with the new publishable and secret API keys

```bash
nvm use
```

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env` from the Supabase dashboard (API Keys). `SUPABASE_SECRET_KEY` is required for admin / service-role operations.

```bash
npm run dev
```

The API listens on `http://localhost:3001`.

## Google sign-in

Dashboard setup (required once):

1. In [Google Cloud Auth Platform](https://console.cloud.google.com/auth/clients), create a **Web application** OAuth client.
2. Authorized JavaScript origins: `http://localhost:3001` and `https://ifldvgtjepybgkhewxyd.supabase.co`
3. Authorized redirect URI: `https://ifldvgtjepybgkhewxyd.supabase.co/auth/v1/callback`
4. In Supabase → **Authentication → Providers → Google**, enable the provider and paste the Client ID and Client Secret.
5. In Supabase → **Authentication → URL Configuration**, add `http://localhost:3001/api/v1/auth/callback` to Redirect URLs.

Then open:

```text
http://localhost:3001/api/v1/auth/google
```

After Google returns, the API stores the Supabase session in httpOnly cookies. Call `/api/v1/me` with those cookies, or send `Authorization: Bearer <access-token>`.

## Database

Apply the initial schema in the Supabase SQL Editor, or with the CLI:

```bash
supabase db push
```

The migration creates profiles, categories, myths, votes, comments, sources, reports, advertisements, RLS policies, and a few approved seed myths.

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/health` | none | Liveness |
| `GET` | `/api/v1/ready` | none | Checks Supabase env + JWKS |
| `GET` | `/api/v1/auth/google` | none | Starts Google OAuth |
| `GET` | `/api/v1/auth/callback` | none | Exchanges the OAuth code |
| `POST` | `/api/v1/auth/logout` | session | Clears the session |
| `GET` | `/api/v1/me` | user JWT or cookie | Returns verified user claims |
| `GET` | `/api/v1/myths` | none | Approved myth feed |
| `GET` | `/api/v1/myths/:idOrSlug` | none | Myth detail |
| `GET` | `/api/v1/myths/:idOrSlug/comments` | none | Visible comments |
| `GET` | `/api/v1/myths/:idOrSlug/sources` | none | Sources |
| `GET` | `/api/v1/categories` | none | Categories |
| `GET` | `/api/v1/categories/:slug` | none | Category + myths |
| `GET` | `/api/v1/search?q=` | none | Search approved myths |
| `GET` | `/api/v1/advertisements` | none | Active ad slides |
| `POST` | `/api/v1/myths` | user | Submit a myth |
| `POST` | `/api/v1/myths/:idOrSlug/votes` | user | Vote true/false |
| `POST` | `/api/v1/myths/:idOrSlug/comments` | user | Add a comment |
| `POST` | `/api/v1/myths/:idOrSlug/reports` | user | Report a myth |
| `GET` | `/api/v1/admin/dashboard` | admin | Platform stats |
| `GET` | `/api/v1/admin/myths/pending` | admin | Review queue |
| `PATCH` | `/api/v1/admin/myths/:id/approve` | admin | Publish a myth |
| `PATCH` | `/api/v1/admin/myths/:id/reject` | admin | Reject a myth |
| `GET` | `/api/v1/admin/comments` | admin | Moderate comments |
| `GET` | `/api/v1/admin/reports` | admin | Review reports |
| `GET` | `/api/v1/admin/users` | admin | Manage users |
| `GET` | `/api/v1/admin/advertisements` | admin | Manage ad slides |

The first signed-in user who opens `/api/v1/admin/dashboard` becomes an admin if no admin exists yet. To add more later:

```sql
insert into public.admin_allowlist (email) values ('you@example.com');
```

## Scripts

```bash
npm run dev        # watch mode
npm run typecheck
npm run lint
npm run build
npm start
```
