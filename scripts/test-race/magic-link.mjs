// Generate a sign-in magic link for any user WITHOUT sending an email.
// Bypasses Supabase's built-in email rate limit during testing.
//
// Usage:
//   npm run test-race:link -- --email drujstew@gmail.com
//   npm run test-race:link -- --email drujstew+racer03@gmail.com --redirect /promoter
//   npm run test-race:link -- --name "Dana Yates" --redirect /my-results
//
// Paste the printed URL into the browser you want to sign in with.

import { createClient } from "@supabase/supabase-js";

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith("--")) {
    const key = a.slice(2);
    const next = process.argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
}

const siteUrl = args.site ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const returnUrl = typeof args.redirect === "string" ? args.redirect : "/";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Resolve an email either directly (--email) or by racer name (--name "First Last").
let email = typeof args.email === "string" ? args.email : null;

if (!email && typeof args.name === "string") {
  const parts = args.name.trim().split(/\s+/);
  const first = parts[0] ?? "";
  const last = parts.slice(1).join(" ");
  let query = supabase.from("profiles").select("first_name,last_name,email,pr_id").ilike("first_name", first);
  if (last) query = query.ilike("last_name", last);
  const { data: matches, error: lookupErr } = await query.limit(25);
  if (lookupErr) {
    console.error("Name lookup failed:", lookupErr.message);
    process.exit(1);
  }
  const withEmail = (matches ?? []).filter((m) => m.email);
  if (withEmail.length === 0) {
    console.error(`No profile found matching "${args.name}".`);
    process.exit(1);
  }
  if (withEmail.length > 1) {
    console.error(`Multiple profiles match "${args.name}" — re-run with --email for the right one:`);
    for (const m of withEmail) {
      console.error(`  ${m.first_name} ${m.last_name}  ${m.email}  (PR ${m.pr_id ?? "—"})`);
    }
    process.exit(1);
  }
  email = withEmail[0].email;
  console.log(`Matched ${withEmail[0].first_name} ${withEmail[0].last_name} <${email}> (PR ${withEmail[0].pr_id ?? "—"})`);
}

if (!email) {
  console.error(
    'Missing --email or --name. Examples:\n  npm run test-race:link -- --email someone@example.com\n  npm run test-race:link -- --name "Dana Yates" --redirect /my-results',
  );
  process.exit(1);
}

const { data, error } = await supabase.auth.admin.generateLink({
  type: "magiclink",
  email,
});

if (error) {
  console.error("Failed to generate link:", error.message);
  process.exit(1);
}

const tokenHash = data.properties?.hashed_token;
if (!tokenHash) {
  console.error("No token_hash returned by generateLink.");
  process.exit(1);
}

// Route through our own /auth/confirm (verifyOtp) instead of Supabase's hosted
// verify endpoint, so the link works without a browser-stored PKCE verifier.
const link = `${siteUrl}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&returnUrl=${encodeURIComponent(returnUrl)}`;

console.log("");
console.log(`Magic link for ${email} (open in the browser you want signed in):`);
console.log("");
console.log(link);
console.log("");
console.log("Note: link is single-use and expires (usually within an hour).");
