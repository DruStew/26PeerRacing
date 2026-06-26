import "server-only";

/** Emails allowed to view /admin/finance (in addition to global admin role). */
const DEFAULT_FINANCE_ADMIN_EMAILS = ["drujstew@gmail.com"];

export function getFinanceAdminEmails(): string[] {
  const fromEnv = process.env.FINANCE_ADMIN_EMAILS?.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return fromEnv?.length ? fromEnv : DEFAULT_FINANCE_ADMIN_EMAILS;
}

export function isFinanceAdmin(email: string | undefined): boolean {
  if (!email) return false;
  return getFinanceAdminEmails().includes(email.toLowerCase());
}
