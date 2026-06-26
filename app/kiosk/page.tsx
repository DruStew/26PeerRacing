import { KioskShell } from "@/components/kiosk/KioskShell";

export default function KioskLandingPage() {
  return (
    <KioskShell eyebrow="Kiosk" title="Check-in tablet">
      <p className="text-sm leading-relaxed text-[#1E3A5F]/80">
        Open the <strong>event kiosk link</strong> your race director shared for this race. You&apos;ll enter the
        6-digit <strong>kiosk code</strong> on that page.
      </p>
      <p className="mt-3 text-sm text-[#1E3A5F]/70">
        No personal Peer Racing login is required on check-in tablets.
      </p>
      <p className="mt-6 text-xs text-[#1E3A5F]/55">
        Race directors: generate today&apos;s codes from your promoter dashboard → Race day kiosk.
      </p>
    </KioskShell>
  );
}
