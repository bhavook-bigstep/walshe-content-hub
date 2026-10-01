import type { ReactNode } from "react";
import Link from "next/link";

export interface Crumb {
  label: string;
  href?: string; // last crumb (current page) omits href
}

// Page header with a breadcrumb trail, optional eyebrow, and a primary action slot
// (brief §4 app shell / AC21: "page header with breadcrumb").
export default function PageHeader({
  title,
  description,
  eyebrow,
  breadcrumbs,
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
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <nav aria-label="Breadcrumb" className="mb-2">
            <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-small text-walshe-grey">
              {breadcrumbs.map((c, i) => {
                const last = i === breadcrumbs.length - 1;
                return (
                  <li key={`${c.label}-${i}`} className="flex items-center gap-x-1.5">
                    {c.href && !last ? (
                      <Link
                        href={c.href}
                        className="rounded-sm font-medium text-walshe-teal transition-colors hover:text-walshe-teal-700 hover:underline"
                      >
                        {c.label}
                      </Link>
                    ) : (
                      <span aria-current={last ? "page" : undefined} className={last ? "text-walshe-ink" : undefined}>
                        {c.label}
                      </span>
                    )}
                    {!last && (
                      <span aria-hidden className="text-walshe-grey/70">
                        /
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        ) : (
          eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>
        )}
        <h1 className="font-display text-h1 font-normal text-walshe-ink">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-body text-walshe-grey">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
