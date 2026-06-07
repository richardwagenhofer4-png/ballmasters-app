"use client";
import type { ViewMode } from "@/lib/useViewMode";

interface Props {
  value: ViewMode;
  onChange: (m: ViewMode) => void;
}

const OPTIONS: { mode: ViewMode; label: string; icon: React.ReactNode }[] = [
  {
    mode: "list",
    label: "List",
    icon: (
      <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
        <rect x="1" y="3" width="14" height="2" rx="1" />
        <rect x="1" y="7" width="14" height="2" rx="1" />
        <rect x="1" y="11" width="14" height="2" rx="1" />
      </svg>
    ),
  },
  {
    mode: "grid",
    label: "Grid",
    icon: (
      <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
        <rect x="1" y="1" width="6" height="6" rx="1" />
        <rect x="9" y="1" width="6" height="6" rx="1" />
        <rect x="1" y="9" width="6" height="6" rx="1" />
        <rect x="9" y="9" width="6" height="6" rx="1" />
      </svg>
    ),
  },
  {
    mode: "cards",
    label: "Cards",
    icon: (
      <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
        <rect x="1" y="1" width="14" height="4" rx="1" />
        <rect x="1" y="6" width="14" height="4" rx="1" />
        <rect x="1" y="11" width="14" height="4" rx="1" />
      </svg>
    ),
  },
];

export default function ViewToggle({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg p-0.5" style={{ backgroundColor: "#f3f4f6" }}>
      {OPTIONS.map(({ mode, label, icon }) => (
        <button
          key={mode}
          onClick={() => onChange(mode)}
          title={label}
          className="flex items-center justify-center rounded-md w-7 h-7 transition"
          style={value === mode
            ? { backgroundColor: "#001c48", color: "white" }
            : { color: "#9ca3af" }}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}
