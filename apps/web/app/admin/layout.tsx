import type { ReactNode } from "react";
import AppShell from "../../components/shell/AppShell";

// Branded, role-aware app shell for every authenticated admin screen (AC21).
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AppShell role="super_admin">{children}</AppShell>;
}
