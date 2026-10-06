import type { ReactNode } from "react";

export interface Crumb {
  label: string;
  href?: string;
}

// Page header: eyebrow, title, description, and a primary action slot. The breadcrumb trail now
// lives in the app shell's top bar (AppShell), so it is not rendered here. The `breadcrumbs` prop is
// accepted for backwards compatibility with existing call sites but intentionally ignored.
//
// The big page title is NOT rendered by default: the sidebar already names the section, so repeating
// it in the workspace is redundant. Content/detail pages whose title is real content (e.g. a catalog
// entry's name) opt back in with `renderTitle`.
export default function PageHeader({
  title,
  description,
  eyebrow,
  action,
  renderTitle = false,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  breadcrumbs?: readonly Crumb[];
  action?: ReactNode;
  /** Render the title as a visible <h1>. Use only where the title is meaningful content. */
  renderTitle?: boolean;
}) {
  const showTitle = renderTitle && Boolean(title);
  // Nothing to show → render nothing (keeps the layout tight when a page has no header content).
  if (!showTitle && !description && !action) return null;
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {showTitle && eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        {showTitle && <h1 className="font-display text-h1 font-semibold text-walshe-ink">{title}</h1>}
        {description && (
          <p className={`${showTitle ? "mt-2 " : ""}max-w-2xl text-body text-walshe-grey`}>{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
