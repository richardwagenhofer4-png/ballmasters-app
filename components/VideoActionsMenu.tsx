"use client";

import { useEffect, useRef, useState } from "react";

export interface VideoActionsMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

export default function VideoActionsMenu({ items }: { items: VideoActionsMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent | TouchEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative shrink-0"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen((o) => !o);
        }}
        aria-label="Video actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className="h-10 w-10 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 active:bg-gray-200 transition"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 6.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm0 7a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm0 7a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-11 z-30 min-w-[176px] bg-white rounded-xl border border-gray-200 shadow-lg py-1 overflow-hidden"
        >
          {items.map((item, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setOpen(false);
                item.onClick();
              }}
              className={`w-full text-left px-4 py-2.5 text-sm font-medium transition min-h-[40px] flex items-center ${
                item.danger
                  ? "text-red-600 hover:bg-red-50 active:bg-red-100"
                  : "text-gray-700 hover:bg-gray-50 active:bg-gray-100"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
