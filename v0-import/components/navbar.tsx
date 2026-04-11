"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";

const navigation = [
  { name: "Events", href: "/events" },
  { name: "Membership", href: "/membership" },
];

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-[#1E3A5F]/10 bg-white">
      <nav className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3">
        {/* Logo */}
        <Link href="/" className="flex items-center">
          <Image
            src="/images/pr-logo.png"
            alt="Peer Racing"
            width={120}
            height={60}
            className="h-10 w-auto"
          />
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden items-center gap-8 md:flex">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="text-sm font-medium text-[#1E3A5F] transition-colors hover:text-[#E87722]"
            >
              {item.name}
            </Link>
          ))}
        </div>

        {/* Desktop CTA */}
        <div className="hidden items-center gap-3 md:flex">
          <Button asChild variant="ghost" size="sm" className="text-[#1E3A5F] hover:text-[#E87722] hover:bg-transparent">
            <Link href="/login">Sign In</Link>
          </Button>
          <Button asChild size="sm" className="bg-[#E87722] hover:bg-[#E87722]/90 text-white">
            <Link href="/events">Enter a Race</Link>
          </Button>
        </div>

        {/* Mobile menu button */}
        <button
          type="button"
          className="md:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          <span className="sr-only">Toggle menu</span>
          {mobileMenuOpen ? (
            <X className="h-6 w-6 text-[#1E3A5F]" />
          ) : (
            <Menu className="h-6 w-6 text-[#1E3A5F]" />
          )}
        </button>
      </nav>

      {/* Mobile Navigation */}
      {mobileMenuOpen && (
        <div className="border-t border-[#1E3A5F]/10 bg-white md:hidden">
          <div className="space-y-1 px-6 py-4">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="block py-2 text-base font-medium text-[#1E3A5F] hover:text-[#E87722]"
                onClick={() => setMobileMenuOpen(false)}
              >
                {item.name}
              </Link>
            ))}
            <div className="mt-4 flex flex-col gap-2 pt-4 border-t border-[#1E3A5F]/10">
              <Button asChild variant="outline" className="w-full border-[#1E3A5F]/20 text-[#1E3A5F]">
                <Link href="/login">Sign In</Link>
              </Button>
              <Button asChild className="w-full bg-[#E87722] hover:bg-[#E87722]/90 text-white">
                <Link href="/events">Enter a Race</Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
