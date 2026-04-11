import { BulkImportClient } from "@/components/bulk-import/BulkImportClient";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function AdminBulkImportPage() {
  const supabase = await createServerSupabaseClient();

  const { data: events } = await supabase
    .from("events")
    .select("id,name,city,state,race_date, distances(id,label,sort_order)")
    .order("race_date", { ascending: true });

  return <BulkImportClient events={events ?? []} audience="admin" />;
}
