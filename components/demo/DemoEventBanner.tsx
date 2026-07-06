import Link from "next/link";

export function DemoEventBanner({ eventId }: { eventId: string }) {
  return (
    <div className="rounded-xl border border-violet-300 bg-violet-50 px-4 py-3 text-sm text-violet-950">
      <p className="font-semibold">Demo race — preview only</p>
      <p className="mt-1 leading-relaxed text-violet-900/90">
        Full promoter tools are live (distances, roster check-in, payout calculator, results console).
        Nothing publishes to the public site, and no memberships, wallets, or magic links are involved.
        Delete this demo when the walkthrough is done.
      </p>
      <p className="mt-2">
        <Link
          href={`/admin/demo-races/${eventId}`}
          className="font-semibold text-violet-900 underline underline-offset-2 hover:text-[#E87722]"
        >
          Demo race hub
        </Link>
        {" · "}
        <Link
          href="/admin/demo-races"
          className="font-semibold text-violet-900 underline underline-offset-2 hover:text-[#E87722]"
        >
          All demo races
        </Link>
      </p>
    </div>
  );
}
