import Link from "next/link";
import { redirect } from "next/navigation";

import { stickerSvg } from "@/lib/timing/tag-sticker";
import { TAG_CAPACITY } from "@/lib/timing/tags";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Print-ready timing tag sheets. Tags are event-agnostic — the kiosk binds a
 * sticker to a runner at check-in — so one printed roll serves every race.
 * Print on matte waterproof label stock; glossy stock glares and blinds the
 * camera.
 */
export default async function TimingTagsPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; count?: string }>;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?returnUrl=${encodeURIComponent("/promoter/timing-tags")}`);
  }

  const params = await searchParams;
  const from = Math.max(0, Math.min(TAG_CAPACITY - 1, parseInt(params.from ?? "0", 10) || 0));
  const countRaw = parseInt(params.count ?? "60", 10) || 60;
  const count = Math.max(1, Math.min(TAG_CAPACITY - from, countRaw));
  const ids = Array.from({ length: count }, (_, i) => from + i);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 print:max-w-none print:p-0">
      <div className="print:hidden">
        <Link href="/promoter" className="text-sm font-medium text-[#1E3A5F]/70 hover:text-[#E87722]">
          ← Promoter home
        </Link>
        <h1 className="font-display mt-4 text-3xl font-bold text-[#1E3A5F]">Timing tag stickers</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#1E3A5F]/75">
          Print these on <strong>matte</strong> waterproof label stock (glossy glares and blinds
          the camera) at <strong>100% scale — do not &ldquo;fit to page&rdquo;</strong>. Each tag
          should be about 3.5&Prime; wide. Tags are reusable across events: at check-in, scan the
          sticker with &ldquo;Scan timing tag&rdquo; to link it to the runner. Showing tags{" "}
          {from}–{from + count - 1} of 0–{TAG_CAPACITY - 1}.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          {from + count < TAG_CAPACITY ? (
            <Link
              className="font-semibold text-[#E87722] hover:underline"
              href={`/promoter/timing-tags?from=${from + count}&count=${count}`}
            >
              Next {Math.min(count, TAG_CAPACITY - from - count)} tags →
            </Link>
          ) : null}
          {from > 0 ? (
            <Link
              className="font-semibold text-[#E87722] hover:underline"
              href={`/promoter/timing-tags?from=${Math.max(0, from - count)}&count=${count}`}
            >
              ← Previous
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 print:mt-0 print:grid-cols-2 print:gap-2">
        {ids.map((id) => (
          <div
            key={id}
            className="flex items-center justify-center rounded border border-dashed border-[#1E3A5F]/20 p-2 print:break-inside-avoid print:rounded-none print:border-[#1E3A5F]/30"
            dangerouslySetInnerHTML={{ __html: stickerSvg(id) }}
          />
        ))}
      </div>
    </main>
  );
}
