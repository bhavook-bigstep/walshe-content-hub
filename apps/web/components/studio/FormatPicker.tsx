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
    <label className="flex items-center gap-2 text-sm">
      <span className="font-medium">Format</span>
      <select
        aria-label="Format"
        className="rounded border border-gray-300 px-2 py-1"
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
