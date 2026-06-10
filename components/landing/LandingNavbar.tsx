"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { DEFAULT_PUBLIC_ROUTE, KIOSK_ROUTE, MY_ENTRIES_ROUTE, WALLET_ROUTE } from "@/lib/routes";

const publicNav = [
  { name: "Find a Race", href: DEFAULT_PUBLIC_ROUTE },
  { name: "From Our Founder", href: "/#from-founder" },
  { name: "Host an Event", href: "/promoter" },
] as const;

/** Race-day staff only (promoter/admin); hidden from runners and signed-out visitors. */
const kioskLink = { name: "PR Kiosk", href: KIOSK_ROUTE } as const;

const membershipLink = {
  name: "Membership",
  href: "/membership/renew",
} as const;

const walletLink = { name: "Wallet", href: WALLET_ROUTE } as const;
const myEntriesLink = { name: "My Entries", href: MY_ENTRIES_ROUTE } as const;

export function LandingNavbar() {
  const [open, setOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [isRaceStaff, setIsRaceStaff] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function loadSession() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;

      if (!user) {
        setSignedIn(false);
        setFirstName(null);
        setIsRaceStaff(false);
        setSessionReady(true);
        return;
      }

      setSignedIn(true);
      const [{ data: profile }, { data: staffRole }, { count: ownedEventCount }] =
        await Promise.all([
          supabase.from("profiles").select("first_name").eq("id", user.id).maybeSingle(),
          supabase
            .from("roles")
            .select("role")
            .eq("user_id", user.id)
            .in("role", ["promoter", "admin"])
            .limit(1)
            .maybeSingle(),
          supabase
            .from("events")
            .select("id", { count: "exact", head: true })
            .eq("promoter_id", user.id),
        ]);

      if (!cancelled) {
        const name = profile?.first_name?.trim();
        setFirstName(name && name.length > 0 ? name : null);
        setIsRaceStaff(Boolean(staffRole) || (ownedEventCount ?? 0) > 0);
        setSessionReady(true);
      }
    }

    void loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadSession();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const greeting =
    signedIn && firstName
      ? `Hi, ${firstName}`
      : signedIn
        ? "Hi there"
        : null;

  const navLinks = signedIn
    ? [publicNav[0], ...(isRaceStaff ? [kioskLink] : []), publicNav[1], publicNav[2], myEntriesLink]
    : [publicNav[0], publicNav[1], membershipLink, publicNav[2]];

  return (
    <header className="sticky top-0 z-50 border-b border-[#1E3A5F]/10 bg-white">
      <nav className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="inline-flex shrink-0 items-center py-0.5">
          <Image
            src="/PR_LOGO_COLOR.png"
            alt="Peer Racing"
            width={320}
            height={128}
            className="h-14 w-auto sm:h-16"
            priority
          />
        </Link>

        <div className="hidden items-center gap-6 md:flex">
          {navLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-[#1E3A5F] transition-colors hover:text-[#E87722]"
            >
              {item.name}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          {!sessionReady ? (
            <span
              className="inline-block h-5 w-24 animate-pulse rounded bg-[#1E3A5F]/10"
              aria-hidden
            />
          ) : signedIn ? (
            <div ref={userMenuRef} className="relative">
              <button
                type="button"
                className="inline-flex items-center gap-1 text-sm font-medium text-[#1E3A5F] transition-colors hover:text-[#E87722]"
                aria-expanded={userMenuOpen}
                aria-haspopup="menu"
                aria-controls="landing-user-menu"
                id="landing-user-menu-button"
                onClick={() => setUserMenuOpen((v) => !v)}
              >
                {greeting}
                <svg
                  className={`h-4 w-4 shrink-0 transition-transform ${userMenuOpen ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {userMenuOpen ? (
                <div
                  id="landing-user-menu"
                  role="menu"
                  aria-labelledby="landing-user-menu-button"
                  className="absolute right-0 top-full z-50 mt-1 min-w-[11rem] rounded-md border border-[#1E3A5F]/15 bg-white py-1 shadow-lg"
                >
                  <Link
                    href={membershipLink.href}
                    role="menuitem"
                    className="block px-3 py-2 text-sm font-medium text-[#1E3A5F] hover:bg-[#1E3A5F]/5 hover:text-[#E87722]"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    {membershipLink.name}
                  </Link>
                  <Link
                    href={walletLink.href}
                    role="menuitem"
                    className="block px-3 py-2 text-sm font-medium text-[#1E3A5F] hover:bg-[#1E3A5F]/5 hover:text-[#E87722]"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    {walletLink.name}
                  </Link>
                </div>
              ) : null}
            </div>
          ) : (
            <Link
              href="/login"
              className="text-sm font-medium text-[#1E3A5F] transition-colors hover:text-[#E87722]"
            >
              Sign In
            </Link>
          )}
          <Link
            href={DEFAULT_PUBLIC_ROUTE}
            className="inline-flex items-center justify-center rounded-md bg-[#E87722] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#E87722]/90"
          >
            Enter a Race
          </Link>
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-[#1E3A5F] md:hidden"
          aria-expanded={open}
          aria-controls="landing-mobile-nav"
          onClick={() => setOpen((o) => !o)}
        >
          <span className="sr-only">Toggle menu</span>
          {open ? (
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </nav>

      {open ? (
        <div id="landing-mobile-nav" className="border-t border-[#1E3A5F]/10 bg-white md:hidden">
          <div className="space-y-1 px-4 py-4 sm:px-6">
            {navLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block py-2 text-base font-medium text-[#1E3A5F] hover:text-[#E87722]"
                onClick={() => setOpen(false)}
              >
                {item.name}
              </Link>
            ))}
            <div className="mt-4 flex flex-col gap-2 border-t border-[#1E3A5F]/10 pt-4">
              {!sessionReady ? (
                <span
                  className="inline-flex h-10 w-full animate-pulse rounded-md bg-[#1E3A5F]/10"
                  aria-hidden
                />
              ) : signedIn ? (
                <div className="flex flex-col gap-1">
                  <span className="py-1 text-center text-base font-semibold text-[#1E3A5F]">
                    {greeting}
                  </span>
                  <Link
                    href={membershipLink.href}
                    className="block py-2 pl-2 text-base font-medium text-[#1E3A5F] hover:text-[#E87722]"
                    onClick={() => setOpen(false)}
                  >
                    {membershipLink.name}
                  </Link>
                  <Link
                    href={walletLink.href}
                    className="block py-2 pl-2 text-base font-medium text-[#1E3A5F] hover:text-[#E87722]"
                    onClick={() => setOpen(false)}
                  >
                    {walletLink.name}
                  </Link>
                </div>
              ) : (
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-md border border-[#1E3A5F]/25 px-4 py-2.5 text-sm font-semibold text-[#1E3A5F]"
                  onClick={() => setOpen(false)}
                >
                  Sign In
                </Link>
              )}
              <Link
                href={DEFAULT_PUBLIC_ROUTE}
                className="inline-flex items-center justify-center rounded-md bg-[#E87722] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#E87722]/90"
                onClick={() => setOpen(false)}
              >
                Enter a Race
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
