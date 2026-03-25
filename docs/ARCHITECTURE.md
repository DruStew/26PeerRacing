# Architecture

This is a Next.js (App Router) application deployed to Vercel with Supabase
(Postgres + Auth + RLS) as the backend.

## Repo structure

- `app/`: App Router routes, layouts, and server/client components
- `public/`: Static assets served as-is
- `lib/`: Shared server-side modules
- `lib/supabase/server.ts`: Single server-side Supabase client for all data access
- `lib/supabase/admin.ts`: Server-only admin/service-role Supabase client
- `docs/`: Project documentation
- Root config: `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`

## Local development

- `npm install`
- `npm run dev`
- `npm run lint`
- `npm run build`
- `npm run start`

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; required for admin access)

## Deployment (Vercel)

- Set all environment variables in the Vercel project settings.
- Keep `SUPABASE_SERVICE_ROLE_KEY` scoped to server-only usage.
- Sensitive logic must run in server actions or route handlers.
- Favor cache-friendly patterns for public pages (static or revalidated).

## Conventions

- All list views must be paginated.
- All database access goes through `lib/supabase/server.ts`.
- Admin/service-role access only via `lib/supabase/admin.ts` (never in client).
- Keep formatting consistent with existing ESLint defaults (`npm run lint`).
