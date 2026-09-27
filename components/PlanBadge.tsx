// Plan pill for coach screens: None / Access / Access · trial / Coached /
// Coached · annual … Callers only render it while plan tools are visible
// (paywall on, or config/app.planToolsEnabled).

import { effectivePlan, planBadgeLabel, toDate, type PlanFields } from "@/lib/entitlements";

function describe(user: PlanFields): string {
  const plan = effectivePlan({ ...user, role: undefined });
  if (plan === "none") return "No active plan";
  const source = user.planSource === "revenuecat" ? "App Store" : user.planSource === "admin" ? "Granted by staff" : "Plan";
  const expires = toDate(user.planExpiresAt);
  if (!expires) return `${source} · no end date`;
  const date = expires.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const verb = user.planSource === "revenuecat" && user.planWillRenew !== false ? "renews" : "expires";
  return `${source} · ${verb} ${date}`;
}

export default function PlanBadge({ user, size = "sm" }: { user: PlanFields; size?: "sm" | "xs" }) {
  const label = planBadgeLabel(user);
  const plan = effectivePlan({ ...user, role: undefined });
  const style =
    plan === "coached"
      ? { backgroundColor: "#001c48", color: "#01fff9" }
      : plan === "access"
      ? { backgroundColor: "rgba(1,255,249,0.18)", color: "#001c48" }
      : { backgroundColor: "#f3f4f6", color: "#6b7280" };
  return (
    <span
      title={describe(user)}
      className={`inline-flex items-center shrink-0 whitespace-nowrap rounded-full font-semibold ${size === "xs" ? "text-[10px] px-1.5 py-px" : "text-xs px-2 py-0.5"}`}
      style={style}
    >
      {label}
    </span>
  );
}

export { describe as describePlan };
