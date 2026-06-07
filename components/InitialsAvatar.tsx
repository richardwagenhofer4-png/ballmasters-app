"use client";

const STUDENT_PALETTE: [string, string][] = [
  ["#B5D4F4", "#0C447C"],
  ["#F4C0D1", "#72243E"],
  ["#C0DD97", "#27500A"],
  ["#FAC775", "#854F0B"],
  ["#CECBF6", "#3C3489"],
];

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return h;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface InitialsAvatarProps {
  name: string;
  id: string;
  size: number;
  variant: "coach" | "student";
}

export default function InitialsAvatar({ name, id, size, variant }: InitialsAvatarProps) {
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
