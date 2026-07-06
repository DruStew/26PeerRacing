import { redirect } from "next/navigation";

import { requireSuperAdmin } from "@/lib/admin/require-admin";

export default async function DemoRacesLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdmin("/admin/demo-races");
  return children;
}
