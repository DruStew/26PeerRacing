// Generate a sign-in magic link for any user WITHOUT sending an email.
// Bypasses Supabase's built-in email rate limit during testing.
//
// Usage:
//   npm run test-race:link -- --email drujstew@gmail.com
//   npm run test-race:link -- --email drujstew+racer03@gmail.com --redirect /promoter
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

const email = args.email;
if (!email) {
  console.error("Missing --email. Example: npm run test-race:link -- --email someone@example.com");
  process.exit(1);
}

const siteUrl = args.site ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const returnUrl = typeof args.redirect === "string" ? args.redirect : "/";
const redirectTo = `${siteUrl}/auth/callback?returnUrl=${encodeURIComponent(returnUrl)}`;

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await supabase.auth.admin.generateLink({
  type: "magiclink",
  email,
  options: { redirectTo },
});

if (error) {
  console.error("Failed to generate link:", error.message);
  process.exit(1);
}

console.log("");
console.log(`Magic link for ${email} (open in the browser you want signed in):`);
console.log("");
console.log(data.properties?.action_link);
console.log("");
console.log("Note: link is single-use and expires (usually within an hour).");
