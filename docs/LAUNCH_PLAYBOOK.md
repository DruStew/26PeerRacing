# Launch playbook — PeerRacing.com

**Saved:** June 2026 · Resume here tomorrow.

This doc captures the deployment path to production and the Race Hub offline plan discussed before launch. The app is **Vercel + Supabase + Stripe** — no new infrastructure required.

---

## Tomorrow: start here

1. **Commit + push** all local changes on `main` → `github.com/DruStew/26PeerRacing`
2. **Vercel** — import repo, deploy, get preview URL (`*.vercel.app`)
3. **Env vars** — paste production values (see checklist below)
4. **Supabase Auth** — allowlist redirect URLs for live domain
5. **Stripe** — webhook + live keys when ready for real money
6. **Smoke test** on preview URL before touching DNS
7. **DNS** — point `peerracing.com` at Vercel

---

## Step 1 — Push code

Repo: `DruStew/26PeerRacing`, branch `main`.

There were uncommitted changes at save time (events, wallet, maps, share, promoter tools, etc.). Nothing is live until pushed.

```powershell
cd c:\26_PR_dev\peer-racing-web
git status
git add …
git commit -m "…"
git push origin main
```

---

## Step 2 — Production database (Supabase)

**Fast path:** Use the existing hosted Supabase project if migrations are already applied (`npm run db:push`).

**Clean path:** New Supabase “Production” project, then:

```powershell
supabase link --project-ref YOUR_PROD_PROJECT_REF
npm run db:push
```

Verify in dashboard: **Storage** bucket `event-artwork` exists.

**Optional CI:** GitHub Actions workflow `.github/workflows/supabase-migrations.yml` needs secrets:
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_PROJECT_REF`

---

## Step 3 — Vercel deploy

1. [vercel.com](https://vercel.com) → New Project → import `DruStew/26PeerRacing`
2. Framework: Next.js (auto)
3. Build: `npm run build`
4. Deploy → test on `*.vercel.app` **before** DNS

See also `docs/ARCHITECTURE.md`.

---

## Step 4 — Environment variables (Vercel → Settings → Environment Variables)

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Public |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Server only — never client |
| `STRIPE_SECRET_KEY` | ✅ for payments | `sk_live_…` for production |
| `STRIPE_WEBHOOK_SECRET` | ✅ | From webhook endpoint (Step 6) |
| `STRIPE_PRICE_MEMBERSHIP_ANNUAL` | ✅ for membership | Live Price ID |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | ✅ for maps | Restrict to `https://peerracing.com/*` |
| `FINANCE_ADMIN_EMAILS` | optional | Comma-separated |
| `NEXT_PUBLIC_PEER_RACING_SHOW_ENTRY_COUNTS` | optional | `true` for field counts on list |

After changing vars → **Redeploy**.

---

## Step 5 — Supabase Auth (magic links)

**Authentication → URL Configuration**

**Site URL:**
```
https://peerracing.com
```
(Pick `www` or bare domain as canonical — use one consistently.)

**Redirect URLs:**
```
https://peerracing.com/auth/callback
https://peerracing.com/auth/callback/**
https://peerracing.com/auth/confirm
https://peerracing.com/auth/confirm/**
https://www.peerracing.com/auth/callback
https://www.peerracing.com/auth/callback/**
```

Login uses `/auth/callback` with `emailRedirectTo` built from `window.location.origin`.

**Email:** Default Supabase mail works for soft launch; add custom SMTP (Resend, Postmark) before heavy traffic.

---

## Step 6 — Stripe (live mode)

1. Dashboard → **Live mode**
2. Live secret key → `STRIPE_SECRET_KEY`
3. Live membership Price → `STRIPE_PRICE_MEMBERSHIP_ANNUAL`
4. **Webhooks → Add endpoint:**
   ```
   https://peerracing.com/api/stripe/webhook
   ```
   Event: `checkout.session.completed`
5. Signing secret → `STRIPE_WEBHOOK_SECRET`
6. Redeploy Vercel

Race entry / membership return URLs use request `origin` — no code change when domain goes live.

**Tip:** Run full payment flow on a Vercel **Preview** deployment with Stripe **test** keys first.

---

## Step 7 — DNS (PeerRacing.com → Vercel)

Vercel → Project → Settings → Domains → add `peerracing.com` and optionally `www`.

Typical records (confirm in Vercel dashboard):

| Type | Name | Value |
|---|---|---|
| A | `@` | Vercel IP (e.g. `76.76.21.21`) |
| CNAME | `www` | `cname.vercel-dns.com` |

Set one canonical host; redirect the other in Vercel.

---

## Launch smoke test (~15 min)

Run on preview URL first, then production domain.

| Test | Why |
|---|---|
| `/` and `/events` | Basic deploy |
| Event page + **Share race** | Share + OG meta |
| Magic link login | Auth redirects |
| Enter race (Stripe) | Checkout + webhook |
| Promoter: edit event, artwork upload | Storage + RLS |
| Kiosk check-in | Race day |
| Publish results | Payout / wallet path |
| `/admin/finance` as admin email | Admin gate |

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Magic link → login error | Supabase redirect URLs |
| Stripe paid, no entry | Webhook URL/secret; Vercel function logs |
| Maps blank | Mapbox token missing or URL restriction |
| Artwork upload fails | Migrations / `event-artwork` bucket |
| Local `npm run build` font TLS errors | Windows TLS quirk; Vercel builds fine |

---

## Race Hub (offline) — after web launch

**Not a launch blocker.** Ship cloud first; build Race Hub in parallel.

### Model
- **Cloud web** — registration, share, wallet, promoter setup, public results
- **Race Hub (downloadable)** — local server on one laptop at the park; slave machines are browsers on LAN (`http://192.168.x.x:3000`)
- **Sync** — append-only outbox on hub; upload to cloud when internet returns

### Must work on LAN
- Check-in search, bib/transponder assignment, confirm check-in
- Roster, day-of walk-ups (cash/comp/pay-later)
- Results CSV import + local standings

### Waits for cloud
- Stripe card payments, magic-link signup, wallet/payouts, public results publish

### Rollout sequence
1. **Phase 0** — Ship web (this playbook)
2. **Phase 1** — Roster export + hotspot backup for first events
3. **Phase 2** — Write Race Day Sync Spec (snapshot schema, outbox ops, idempotency)
4. **Phase 3** — Extract shared `lib/kiosk/*` logic for cloud + hub
5. **Phase 4** — Race Hub v0 (SQLite + local API + check-in UI)
6. **Phase 5** — Sync upload to Supabase
7. **Phase 6** — Results import offline, walk-ups, mDNS optional

---

## Post-launch (not blocking)

- Staging Vercel + Supabase project
- Mapbox token locked to production domain
- Custom auth email (`noreply@peerracing.com`)
- Race Hub installer (Tauri/Electron + embedded Node + SQLite)

---

## Realistic timeline

| Scenario | Time |
|---|---|
| Existing Supabase + push + Vercel tonight | 2–4 hours (+ DNS) |
| New prod Supabase + live Stripe + email | ~half day |

---

*When you open Cursor tomorrow, say: “Let’s follow LAUNCH_PLAYBOOK.md” — or ask to start at Step 1.*
