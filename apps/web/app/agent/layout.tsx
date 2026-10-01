import type { ReactNode } from "react";
import AppShell from "../../components/shell/AppShell";

// Branded, role-aware app shell for every authenticated agent screen (AC21).
export default function AgentLayout({ children }: { children: ReactNode }) {
  return <AppShell role="tourism_agent">{children}</AppShell>;
}
