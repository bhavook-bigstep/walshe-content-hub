import type { ReactNode } from "react";

export interface Crumb {
  label: string;
  href?: string;
}

// Page header: eyebrow, title, description, and a primary action slot. The breadcrumb trail now
// lives in the app shell's top bar (AppShell), so it is not rendered here. The `breadcrumbs` prop is
// accepted for backwards compatibility with existing call sites but intentionally ignored.
export default function PageHeader({
  title,
  description,
  eyebrow,
  action,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  breadcrumbs?: readonly Crumb[];
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="font-display text-h1 font-semibold text-walshe-ink">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-body text-walshe-grey">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
