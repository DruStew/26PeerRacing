import Link from "next/link";
import { redirect } from "next/navigation";

import { stickerSvg } from "@/lib/timing/tag-sticker";
import { TAG_CAPACITY } from "@/lib/timing/tags";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Print-ready timing tag sheets on the Avery 5164 grid (4in x 3-1/3in,
 * 6 per letter sheet — 8164 inkjet / 5523 weatherproof use the same layout).
 * Tags are event-agnostic — the kiosk binds a sticker to a runner at
 * check-in — so one printed batch serves every race.
 */

const PER_SHEET = 6;
// Avery 5164 geometry (inches).
const SHEET_W = 8.5;
const SHEET_H = 11;
const LABEL_W = 4;
const LABEL_H = 10 / 3;
const MARGIN_TOP = 0.5;
const MARGIN_LEFT = 0.15625;
const PITCH_X = 4.1875;

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

  const sheets: number[][] = [];
  for (let i = 0; i < ids.length; i += PER_SHEET) {
    sheets.push(ids.slice(i, i + PER_SHEET));
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 print:max-w-none print:p-0">
      <style>{`
        @page { size: letter; margin: 0; }
        @media print {
          .tag-sheet { margin: 0 !important; border: none !important; box-shadow: none !important; break-after: page; }
          .tag-label { outline: none !important; }
        }
      `}</style>

      <div className="print:hidden">
        <Link href="/promoter" className="text-sm font-medium text-[#1E3A5F]/70 hover:text-[#E87722]">
          ← Promoter home
        </Link>
        <h1 className="font-display mt-4 text-3xl font-bold text-[#1E3A5F]">Timing tag stickers</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#1E3A5F]/75">
          Laid out for <strong>Avery 5164</strong> labels (4&Prime; × 3⅓&Prime;, 6 per sheet) —
          8164 and weatherproof 5523 use the same grid. Matte stock only; glossy glares and blinds
          the camera. Print at <strong>100% scale (&ldquo;Actual size&rdquo;)</strong> with
          margins set to <strong>None/Default</strong> — do not &ldquo;fit to page&rdquo;. Tags
          are reusable across events: at check-in, scan the sticker with &ldquo;Scan timing
          tag&rdquo; to link it to the runner. Showing tags {from}–{from + count - 1} of 0–
          {TAG_CAPACITY - 1} ({sheets.length} sheet{sheets.length === 1 ? "" : "s"}).
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

      <div className="mt-8 print:mt-0">
        {sheets.map((sheet, si) => (
          <div
            key={si}
            className="tag-sheet relative mx-auto mb-8 border border-[#1E3A5F]/20 bg-white shadow-sm"
            style={{ width: `${SHEET_W}in`, height: `${SHEET_H}in` }}
          >
            {sheet.map((id, i) => {
              const col = i % 2;
              const row = Math.floor(i / 2);
              return (
                <div
                  key={id}
                  className="tag-label absolute outline-dashed outline-1 outline-[#1E3A5F]/15"
                  style={{
                    left: `${MARGIN_LEFT + col * PITCH_X}in`,
                    top: `${MARGIN_TOP + row * LABEL_H}in`,
                    width: `${LABEL_W}in`,
                    height: `${LABEL_H}in`,
                  }}
                  dangerouslySetInnerHTML={{ __html: stickerSvg(id) }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </main>
  );
}
