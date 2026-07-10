import { BigScreenClient } from "@/components/timing/BigScreenClient";

export const dynamic = "force-dynamic";

/**
 * Big-screen live results — vertical 1080×1920 display for TVs at the venue
 * and fans at home. Access is enforced by the data API (public when the
 * promoter flips the toggle; promoter preview otherwise).
 *
 * URL options:
 *   ?distance=<id>   only that distance
 *   ?division=Alpha  official-results mode: only that division
 *   ?rotate=15       cycle distances/divisions every N seconds
 */
export default async function BigScreenPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ distance?: string; division?: string; rotate?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const rotate = Math.max(0, parseInt(sp.rotate ?? "0", 10) || 0);

  return (
    <BigScreenClient
      eventId={id}
      distanceFilter={sp.distance ?? null}
      divisionFilter={sp.division ?? null}
      rotateSeconds={rotate}
    />
  );
}
