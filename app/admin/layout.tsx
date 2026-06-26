import { AdminChrome } from "@/components/admin/AdminChrome";
import { requireAdmin } from "@/lib/admin/require-admin";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { admin } = await requireAdmin("/admin");

  return (
    <AdminChrome badge={admin.isSuperAdmin ? "Super Admin" : "Admin"}>
      {children}
    </AdminChrome>
  );
}
