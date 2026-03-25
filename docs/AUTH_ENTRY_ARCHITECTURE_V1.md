# Peer Racing – Auth + Entry Architecture (v1) – Implementation Summary

## Schema Updates (run in order)

1. **`20260223000000_auth_entry_architecture_v1.sql`**
   - **profiles**: Add `dob` (date), `sex` (male/female) for profile completion.
   - **entries**: Unique index `(event_id, distance_id, user_id)` to prevent duplicate entry per race; add `pacer_user_id`, `pacer_status` (requested | accepted | declined | canceled).
   - **distances**: Add `allow_pacers` (boolean), `pacer_fee_cents` (integer, 0 allowed).

2. **`20260223000100_entries_rls_authenticated_only.sql`**
   - Entries **insert**: Only `authenticated`; require `user_id = auth.uid()` and event published.
   - Removes anon insert and anon select for entries (no anonymous entries).

## Supabase Configuration Required

- **Auth → Email**: Email provider is used for magic-link sign-in (`signInWithOtp({ email })`). No SMS cost. When scaling, you can switch back to **Phone** (SMS OTP) by changing the login page and configuring an SMS provider (Twilio, etc.).
- **Redirect URLs**: In Auth → URL Configuration, add your app’s callback (e.g. `https://yourdomain.com/auth/callback`) so the magic link can redirect back with the `returnUrl` query param.

## What’s Implemented

### 1. Authentication (email magic link for now; SMS OTP when scaling)
- **Login** (`/login`): Enter email → Send magic link → User clicks link in email → Auth callback exchanges code and redirects to `returnUrl` (e.g. `/events/:id/enter`).
- No guest accounts; every entry is tied to a verified user (`user_id` set from `auth.uid()`). When you switch to SMS OTP, change the login page back to phone + `verifyOtp`; profile and entry logic stay the same.

### 2. Profile
- **Required for entry**: First name, last name, DOB, sex, email; phone from auth (verified).
- **Profile completion** (`/profile/complete`): Enforced when user tries to enter a race; redirects to complete profile if missing any required field. On save, upserts profile (and syncs phone from auth when present).

### 3. Public vs logged-in
- **Public (no login)**: View events list, event details, distances, race info.
- **Login required**: Enter race, (future: request pacer, act as pacer, manage entries). Enter page redirects to `/login?returnUrl=...` if not signed in.

### 4. Entry architecture
- Every entry has `user_id` (from auth), `distance_id`, and respects PR cutoff (server-enforced).
- **Duplicate prevention**: One entry per (user, event, distance); 409 if user already entered that distance.
- **Entry kinds**: `free` | `paid` | `comp`. API currently sets `free`; comp entries are intended to be created only by promoter/admin (e.g. separate “Add comp entry” flow or override).

### 5. Pacer (structure only)
- **Distances**: Promoter can set “Allow pacers” and “Pacer fee (cents)” on Add/Edit distance.
- **Entries**: `pacer_user_id` and `pacer_status` columns added; ready for “Do you have a pacer?” flow (search by phone, request, accept/decline). SMS/email notifications to pacer are **not** implemented (stub or integrate later).

### 6. Qualifier + rollover
- Unchanged: one Peer Racing Qualifier per event; other distances can allow rollover from qualifier; runner can enter qualifier and roll split to one target distance.

### 7. Cut-off and overrides
- PR cutoff enforced in API; entries after cutoff rejected. Override table exists for promoter/admin to record force-through/comp; override flow (e.g. “Add entry after cutoff”) can be added as a promoter action.

## Files Touched

- **Auth**: `app/login/page.tsx` (phone OTP send + verify).
- **Profile**: `app/profile/complete/page.tsx`, `app/profile/complete/ProfileCompleteForm.tsx`, `lib/profile.ts` (isProfileComplete, required fields).
- **Enter**: `app/events/[id]/enter/page.tsx` (require auth + profile complete, prefill from profile, hidden fields); `app/api/events/[id]/enter/route.ts` (createServerSupabaseClient, user_id, profile validation, duplicate check).
- **Promoter**: `app/promoter/events/[id]/edit/page.tsx` and `app/promoter/events/[id]/distances/[distanceId]/edit/page.tsx` (allow_pacers, pacer_fee_cents).
- **Migrations**: `20260223000000_auth_entry_architecture_v1.sql`, `20260223000100_entries_rls_authenticated_only.sql`.

## Not implemented (future)

- Comp entry creation by promoter/admin (UI + optional override).
- Pacer request flow on enter form (search by phone, set `pacer_user_id` / `pacer_status`, notifications).
- Post-cutoff override UI (promoter adds entry + override record).
