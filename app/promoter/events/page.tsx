import { redirect } from "next/navigation";

/** `/promoter/events` → promoter dashboard (event list lives at `/promoter`). */
export default function PromoterEventsIndexPage() {
  redirect("/promoter");
}
