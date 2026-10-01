import type { ReactNode } from "react";
import AppShell from "../../components/shell/AppShell";

// Branded, role-aware app shell for every authenticated provider screen (AC21).
export default function ProviderLayout({ children }: { children: ReactNode }) {
  return <AppShell role="content_provider">{children}</AppShell>;
}
