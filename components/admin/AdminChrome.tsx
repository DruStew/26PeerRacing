import Link from "next/link";

const nav = [
  { name: "Dashboard", href: "/admin" },
  { name: "Finance", href: "/admin/finance" },
  { name: "Events", href: "/admin/events" },
  { name: "Bulk import", href: "/admin/bulk-import" },
  { name: "Members", href: "/admin/members" },
  { name: "Memberships", href: "/admin/memberships" },
  { name: "Communications", href: "/admin/comms" },
] as const;

const superAdminNav = [{ name: "Demo races", href: "/admin/demo-races" }] as const;

export function AdminChrome({
  children,
  badge = "Admin",
}: {
  children: React.ReactNode;
  badge?: "Super Admin" | "Admin";
}) {
  return (
    <div className="min-h-screen bg-white font-sans text-[#1E3A5F]">
      <header className="sticky top-0 z-50 border-b border-[#1E3A5F]/10 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/"
              className="font-display text-lg font-bold tracking-tight text-[#1E3A5F] transition-colors hover:text-[#E87722]"
            >
              Peer Racing
            </Link>
            <span
              className={`rounded-md px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                badge === "Super Admin"
                  ? "bg-[#E87722]/15 text-[#E87722]"
                  : "bg-[#1E3A5F]/10 text-[#1E3A5F]/80"
              }`}
            >
              {badge}
            </span>
          </div>
          <nav className="flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-[#1E3A5F] transition-colors hover:text-[#E87722]"
              >
                {item.name}
              </Link>
            ))}
            {badge === "Super Admin"
              ? superAdminNav.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="font-semibold text-violet-800 transition-colors hover:text-[#E87722]"
                  >
                    {item.name}
                  </Link>
                ))
              : null}
          </nav>
        </div>
      </header>

      {children}
    </div>
  );
}
