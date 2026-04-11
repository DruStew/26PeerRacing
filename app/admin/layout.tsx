import { AdminChrome } from "@/components/admin/AdminChrome";
import { requireAdmin } from "@/lib/admin/require-admin";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin("/admin");

  return <AdminChrome>{children}</AdminChrome>;
}
