/**
 * Peer Racing division badges — renders the official badge artwork from /public
 * (PR_Alpha.png … PR_Echo.png). Used on the producer results console and, later,
 * racer results pages and the virtual trophy case.
 *
 * Incentive pools (female / military) show a small text chip under the badge;
 * the artwork itself is never tinted or altered.
 */

import Image from "next/image";

/** UI accent colors sampled from the official badge artwork (timeline bands, etc.). */
export const DIVISION_COLORS: Record<string, { base: string; dark: string; light: string }> = {
  Alpha: { base: "#E8252B", dark: "#9E1418", light: "#F6A3A5" },
  Bravo: { base: "#3FA9F5", dark: "#1F6FA8", light: "#B5DDFB" },
  Charlie: { base: "#52D726", dark: "#2F8A14", light: "#BDF0A8" },
  Delta: { base: "#F28C28", dark: "#A85B12", light: "#F9D0A3" },
  Echo: { base: "#A937F2", dark: "#6E1FA6", light: "#DDB3FA" },
};

const BADGE_SRC: Record<string, string> = {
  Alpha: "/PR_Alpha.png",
  Bravo: "/PR_Bravo.png",
  Charlie: "/PR_Charlie.png",
  Delta: "/PR_Delta.png",
  Echo: "/PR_Echo.png",
};

export type BadgeVariant = "main" | "female" | "military";

const VARIANT_CHIP: Record<BadgeVariant, { label: string; className: string } | null> = {
  main: null,
  female: { label: "FEMALE POOL", className: "bg-[#D6336C] text-white" },
  military: { label: "MILITARY POOL", className: "bg-[#5C6B2F] text-white" },
};

export function DivisionBadge({
  division,
  variant = "main",
  size = 72,
  muted = false,
}: {
  division: string;
  variant?: BadgeVariant;
  /** Rendered width in px; height follows the artwork's aspect ratio. */
  size?: number;
  muted?: boolean;
}) {
  const src = BADGE_SRC[division];
  const chip = VARIANT_CHIP[variant];
  if (!src) return null;

  return (
    <span className="inline-flex flex-col items-center gap-1">
      <Image
        src={src}
        alt={`${division} division badge${variant !== "main" ? ` (${variant} pool)` : ""}`}
        width={size}
        height={size}
        className={`h-auto ${muted ? "opacity-40" : ""}`}
        style={{ width: size }}
      />
      {chip ? (
        <span
          className={`rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wider ${chip.className}`}
        >
          {chip.label}
        </span>
      ) : null}
    </span>
  );
}
