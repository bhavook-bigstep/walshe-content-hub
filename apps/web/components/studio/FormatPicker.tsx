"use client";

import { FORMAT_NAMES, FORMAT_PRESETS, type FormatName } from "../../lib/studio/formats";

export default function FormatPicker({
  value,
  onChange,
}: {
  value: FormatName;
  onChange: (format: FormatName) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-small font-semibold text-walshe-ink">Format</span>
      <select
        aria-label="Format"
        className="h-10 rounded-sm border border-walshe-stone bg-walshe-white px-3 text-small font-medium text-walshe-ink transition-colors hover:border-walshe-ink/25 focus:border-walshe-amber"
        value={value}
        onChange={(e) => onChange(e.target.value as FormatName)}
      >
        {FORMAT_NAMES.map((n) => (
          <option key={n} value={n}>
            {FORMAT_PRESETS[n].label} ({FORMAT_PRESETS[n].width}x{FORMAT_PRESETS[n].height})
          </option>
        ))}
      </select>
    </label>
  );
}
