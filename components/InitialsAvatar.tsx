"use client";

import React from "react";

// ---------------------------------------------------------------------------
// Palette + helpers (initials fallback)
// ---------------------------------------------------------------------------

const STUDENT_PALETTE: [string, string][] = [
  ["#B5D4F4", "#0C447C"],
  ["#F4C0D1", "#72243E"],
  ["#C0DD97", "#27500A"],
  ["#FAC775", "#854F0B"],
  ["#CECBF6", "#3C3489"],
];

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ---------------------------------------------------------------------------
// Icon components (inline SVG — no external dep)
// ---------------------------------------------------------------------------

type IP = { s: number; c: string };

const IFootball = ({ s, c }: IP) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="12" rx="9" ry="5.5" transform="rotate(-25 12 12)" />
    <line x1="12" y1="7.5" x2="12" y2="16.5" />
    <line x1="9" y1="11" x2="15" y2="11" />
    <line x1="9" y1="13.5" x2="15" y2="13.5" />
  </svg>
);

const ITrophy = ({ s, c }: IP) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 21h8M12 17v4M6 4H4v4a6 6 0 0012 0V4h-2M6 4h12" />
    <path d="M4 8H2M22 8h-2" />
  </svg>
);

const ITarget = ({ s, c }: IP) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1" />
  </svg>
);

const IWhistle = ({ s, c }: IP) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="13" r="4" />
    <path d="M12 13h8M18 10l3 3-3 3" />
    <line x1="8" y1="9" x2="8" y2="17" />
  </svg>
);

const IMedal = ({ s, c }: IP) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="5" />
    <path d="M8.5 13.5L6 21l6-3 6 3-2.5-7.5" />
  </svg>
);

const IFlag = ({ s, c }: IP) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="21" x2="4" y2="3" />
    <path d="M4 3h14l-4 5 4 5H4" />
  </svg>
);

const IFlame = ({ s, c }: IP) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2C12 2 6 8 6 14a6 6 0 0012 0C18 8 12 2 12 2z" />
    <path d="M12 14c0-2 1.5-4 1.5-4s-1 2-2.5 2" />
  </svg>
);

const IRocket = ({ s, c }: IP) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3a9 9 0 015 8v4l-2 2H9l-2-2v-4a9 9 0 015-8z" />
    <path d="M9 17l-2 4M15 17l2 4" />
    <circle cx="12" cy="10" r="1.5" fill={c} stroke="none" />
  </svg>
);

const IStar = ({ s, c }: IP) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
);

const ICrown = ({ s, c }: IP) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 19h20" />
    <path d="M3 8l4 7 5-8 5 8 4-7v11H3V8z" />
  </svg>
);

const IBolt = ({ s, c }: IP) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
  </svg>
);

const ISmile = ({ s, c }: IP) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M8 14s1.5 2.5 4 2.5 4-2.5 4-2.5" />
    <circle cx="9" cy="10" r="1" fill={c} stroke="none" />
    <circle cx="15" cy="10" r="1" fill={c} stroke="none" />
  </svg>
);

// ---------------------------------------------------------------------------
// AVATAR_OPTIONS — exported, single source of truth
// ---------------------------------------------------------------------------

export interface AvatarOption {
  id: string;
  bg: string;
  color: string;
  Icon: (props: IP) => React.ReactElement;
  label: string;
}

export const AVATAR_OPTIONS: AvatarOption[] = [
  { id: "football", bg: "#C0DD97", color: "#27500A", Icon: IFootball, label: "Football" },
  { id: "trophy",   bg: "#FAC775", color: "#854F0B", Icon: ITrophy,   label: "Trophy"   },
  { id: "target",   bg: "#F4C0D1", color: "#72243E", Icon: ITarget,   label: "Target"   },
  { id: "whistle",  bg: "#CECBF6", color: "#3C3489", Icon: IWhistle,  label: "Whistle"  },
  { id: "medal",    bg: "#F5C4B3", color: "#712B13", Icon: IMedal,    label: "Medal"    },
  { id: "flag",     bg: "#9FE1CB", color: "#085041", Icon: IFlag,     label: "Flag"     },
  { id: "flame",    bg: "#FAC775", color: "#854F0B", Icon: IFlame,    label: "Flame"    },
  { id: "rocket",   bg: "#B5D4F4", color: "#0C447C", Icon: IRocket,   label: "Rocket"   },
  { id: "star",     bg: "#CECBF6", color: "#3C3489", Icon: IStar,     label: "Star"     },
  { id: "crown",    bg: "#FAC775", color: "#854F0B", Icon: ICrown,    label: "Crown"    },
  { id: "bolt",     bg: "#F7C1C1", color: "#791F1F", Icon: IBolt,     label: "Bolt"     },
  { id: "smile",    bg: "#9FE1CB", color: "#085041", Icon: ISmile,    label: "Smile"    },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface InitialsAvatarProps {
  name: string;
  id: string;
  size: number;
  variant: "coach" | "student";
  avatarId?: string;
}

export default function InitialsAvatar({ name, id, size, variant, avatarId }: InitialsAvatarProps) {
  if (avatarId) {
    const opt = AVATAR_OPTIONS.find(o => o.id === avatarId);
    if (opt) {
      const iconSize = Math.max(10, Math.round(size * 0.58));
      return (
        <div
          className="shrink-0 flex items-center justify-center rounded-full"
          style={{ width: size, height: size, backgroundColor: opt.bg }}
        >
          <opt.Icon s={iconSize} c={opt.color} />
        </div>
      );
    }
  }

  const initials = getInitials(name);
  let bg: string;
  let color: string;
  if (variant === "coach") {
    bg = "#f3f4f6";
    color = "#4b5563";
  } else {
    const [bgColor, textColor] = STUDENT_PALETTE[hashId(id) % STUDENT_PALETTE.length];
    bg = bgColor;
    color = textColor;
  }
  const fontSize = Math.max(8, Math.round(size * 0.42));
  return (
    <div
      className="shrink-0 flex items-center justify-center rounded-full font-bold"
      style={{ width: size, height: size, backgroundColor: bg, color, fontSize }}
    >
      {initials}
    </div>
  );
}
