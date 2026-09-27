// Shared visuals for paywall-locked features on student screens. Only ever
// rendered while the paywall switch is on.

export function LockIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
    </svg>
  );
}

/** "🔒 Coached" pill that marks a card as part of the Coached plan. */
export function CoachedLockBadge({ dark = false }: { dark?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full"
      style={dark ? { backgroundColor: "rgba(1,255,249,0.18)", color: "#01fff9" } : { backgroundColor: "#001c48", color: "#01fff9" }}
    >
      <LockIcon className="h-3 w-3" />
      Coached
    </span>
  );
}

/** Small lock in place of a bottom-nav unread badge. */
export function NavLockDot() {
  return (
    <span
      className="absolute -top-1 -right-1.5 h-4 w-4 flex items-center justify-center rounded-full"
      style={{ backgroundColor: "#374151", color: "#01fff9" }}
    >
      <LockIcon className="h-2.5 w-2.5" />
    </span>
  );
}
