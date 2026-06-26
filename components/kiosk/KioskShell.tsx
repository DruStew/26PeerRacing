/**
 * Locked-down chrome for race-day kiosk tablets — no site nav or external links.
 */
export function KioskShell({
  children,
  eyebrow = "Check-In",
  title,
  subtitle,
}: {
  children: React.ReactNode;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="min-h-screen bg-white font-sans text-[#1E3A5F]">
      <header className="border-b border-[#1E3A5F]/10 bg-[#fafbfc] px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/55">
              Peer Racing · {eyebrow}
            </p>
            {title ? (
              <h1 className="font-display mt-0.5 truncate text-lg font-bold text-[#1E3A5F] sm:text-xl">
                {title}
              </h1>
            ) : null}
            {subtitle ? <p className="mt-0.5 truncate text-sm text-[#1E3A5F]/65">{subtitle}</p> : null}
          </div>
          <span className="shrink-0 rounded-md bg-[#E87722]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#E87722]">
            Kiosk
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
