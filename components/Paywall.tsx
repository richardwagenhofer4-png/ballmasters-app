"use client";

// The subscription paywall. Two modes:
//   subscribe — both plans (Coached first and pre-selected), for athletes
//               with no plan. The student gate sends them here.
//   upgrade   — Coached only, for Access members who tapped a locked feature.
//
// Every control sits in the bottom sheet (period toggle, CTA, restore /
// redeem / terms / privacy) so the screen works one-handed at 390px; the plan
// cards above it are tappable anywhere.
//
// Purchases go through lib/billing.ts. On the web there is no native billing,
// so the CTA is replaced by "Subscribe in the Ball Masters iPhone app".
// Nothing here renders while the paywall switch is off — the route redirects
// to the dashboard.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppConfig } from "@/lib/paywall";
import { useEntitlements } from "@/lib/EntitlementsContext";
import { ANNUAL_SAVINGS_LABEL, PLANS, productFor, type BillingPeriod, type PaidPlan } from "@/lib/plans";
import {
  presentCodeRedemption,
  purchase,
  restorePurchases,
  useNativeBillingAvailable,
  type BillingResult,
} from "@/lib/billing";

export type PaywallMode = "subscribe" | "upgrade";

const NAVY = "#001c48";
const CYAN = "#01fff9";

function Spinner() {
  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <svg className="h-10 w-10 animate-spin text-white opacity-40" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
    </main>
  );
}

function CheckIcon({ color }: { color: string }) {
  return (
    <svg className="h-4 w-4 mt-0.5 shrink-0" viewBox="0 0 20 20" fill={color} aria-hidden="true">
      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
    </svg>
  );
}

function PlanCard({
  plan,
  period,
  selected,
  selectable,
  onSelect,
}: {
  plan: PaidPlan;
  period: BillingPeriod;
  selected: boolean;
  selectable: boolean;
  onSelect: () => void;
}) {
  const copy = PLANS[plan];
  const product = productFor(plan, period);
  // Coached is the primary card: navy, with the badge. Access is a plain card.
  const primary = plan === "coached";
  const ring = selected ? `0 0 0 3px ${primary ? CYAN : NAVY}` : undefined;

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className={`text-lg font-extrabold leading-tight ${primary ? "text-white" : "text-gray-900"}`}>{copy.name}</h2>
            {primary && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: CYAN, color: NAVY }}>
                Most complete
              </span>
            )}
          </div>
          <p className="text-sm mt-0.5 leading-snug" style={{ color: primary ? "rgba(1,255,249,0.75)" : "#6b7280" }}>
            {copy.tagline}
          </p>
        </div>
        {selectable && (
          <span
            aria-hidden="true"
            className="mt-1 h-5 w-5 shrink-0 rounded-full flex items-center justify-center"
            style={{ border: `2px solid ${primary ? CYAN : NAVY}`, opacity: selected ? 1 : 0.35 }}
          >
            {selected && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: primary ? CYAN : NAVY }} />}
          </span>
        )}
      </div>
      <p className="mt-3 leading-none">
        <span className={`text-2xl font-extrabold ${primary ? "text-white" : ""}`} style={primary ? undefined : { color: NAVY }}>
          {product.price}
        </span>
        <span className={`text-sm ${primary ? "text-white/70" : "text-gray-500"}`}>/{product.unit}</span>
      </p>
      <ul className="mt-3 space-y-1.5">
        {copy.bullets.map(b => (
          <li key={b} className={`flex items-start gap-2 text-sm leading-snug ${primary ? "text-white/90" : "text-gray-700"}`}>
            <CheckIcon color={primary ? CYAN : NAVY} />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </>
  );

  const className = `block w-full text-left rounded-2xl px-4 py-4 transition ${primary ? "" : "bg-white border border-gray-200"}`;
  const style = { backgroundColor: primary ? NAVY : undefined, boxShadow: ring };

  if (!selectable) {
    return <div className={className} style={style}>{body}</div>;
  }
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onSelect} className={`${className} active:opacity-90`} style={style}>
      {body}
    </button>
  );
}

export default function Paywall({ mode: requestedMode }: { mode: PaywallMode }) {
  const router = useRouter();
  const config = useAppConfig();
  const ent = useEntitlements();
  const native = useNativeBillingAvailable();

  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const [selected, setSelected] = useState<PaidPlan>("coached");
  const [busy, setBusy] = useState<null | "purchase" | "restore" | "redeem">(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "info" | "error"; text: string } | null>(null);

  // An Access member on the plain paywall has only an upgrade to make.
  const mode: PaywallMode =
    requestedMode === "upgrade" || (ent.plan === "access" && !ent.isStaff) ? "upgrade" : "subscribe";
  const plan: PaidPlan = mode === "upgrade" ? "coached" : selected;
  const product = productFor(plan, period);

  const paywallOff = config !== null && !config.paywallEnabled;
  // Nothing left to buy (e.g. the webhook just confirmed a purchase): into the app.
  const satisfied = !ent.isStaff && ent.ready && (mode === "upgrade" ? ent.canSeeBreakdowns : ent.canSeeVideos);

  useEffect(() => {
    if (paywallOff || satisfied) router.replace("/student/dashboard");
  }, [paywallOff, satisfied, router]);

  if (config === null || paywallOff || !ent.ready || satisfied) return <Spinner />;

  async function run(kind: "purchase" | "restore" | "redeem", action: () => Promise<BillingResult>) {
    setBusy(kind);
    setNotice(null);
    try {
      const result = await action();
      if (result.ok) {
        // The plan itself arrives via the RevenueCat webhook; the entitlements
        // listener sees it and the effect above moves on.
        setNotice({ tone: "ok", text: kind === "restore" ? "Purchases restored. Unlocking…" : "Thanks! Unlocking your plan…" });
      } else if (result.reason !== "cancelled") {
        setNotice({ tone: result.reason === "unavailable" ? "info" : "error", text: result.message });
      }
    } catch {
      setNotice({ tone: "error", text: "Something went wrong. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push("/student/dashboard");
  }

  const ctaLabel = product.trialDays ? `Start ${product.trialDays}-day free trial` : "Subscribe";
  const finePrint = product.trialDays
    ? `${product.trialDays}-day free trial, then ${product.price}/${product.unit}. Auto-renews until cancelled in Settings.`
    : `${product.price}/${product.unit}. Auto-renews until cancelled in Settings.`;

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col">
      <div style={{ backgroundColor: NAVY }} className="pt-12 pb-6 px-4">
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-between mb-4">
            <img src="/logo-light.png" alt="Ball Masters Florida" style={{ height: "32px", width: "auto" }} />
            {mode === "upgrade" ? (
              <button onClick={goBack} className="min-h-11 px-2 -mr-2 text-sm font-medium" style={{ color: "rgba(1,255,249,0.8)" }}>
                Not now
              </button>
            ) : (
              <Link href="/student/profile" className="min-h-11 px-2 -mr-2 inline-flex items-center text-sm font-medium" style={{ color: "rgba(1,255,249,0.8)" }}>
                Account
              </Link>
            )}
          </div>
          <h1 className="text-2xl font-extrabold text-white leading-tight">
            {mode === "upgrade" ? "Upgrade to Coached" : "Choose your plan"}
          </h1>
          <p className="text-sm mt-1" style={{ color: "rgba(1,255,249,0.75)" }}>
            {mode === "upgrade"
              ? "Your coach's breakdowns, drill comparisons and a direct line to your coach."
              : "Every training session on video — with your coach's breakdowns on Coached."}
          </p>
        </div>
      </div>

      <div className="flex-1 px-4 pt-5" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 304px)" }}>
        <div className="max-w-md mx-auto space-y-4">
          {ent.isStaff && (
            <p className="rounded-xl px-4 py-3 text-xs" style={{ backgroundColor: "rgba(0,28,72,0.06)", color: NAVY }}>
              Preview — coaches and admins always have full access.
            </p>
          )}
          {mode === "upgrade" ? (
            <PlanCard plan="coached" period={period} selected selectable={false} onSelect={() => {}} />
          ) : (
            <div role="radiogroup" aria-label="Plan" className="space-y-4">
              {(["coached", "access"] as const).map(p => (
                <PlanCard key={p} plan={p} period={period} selected={selected === p} selectable onSelect={() => setSelected(p)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom sheet: every control within thumb reach */}
      <div
        className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 px-4 pt-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 6px)" }}
      >
        <div className="max-w-md mx-auto">
          <div role="radiogroup" aria-label="Billing period" className="grid grid-cols-2 gap-1 rounded-xl p-1" style={{ backgroundColor: "#f3f4f6" }}>
            {(["monthly", "annual"] as const).map(p => {
              const active = period === p;
              return (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setPeriod(p)}
                  className="min-h-11 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 transition"
                  style={active ? { backgroundColor: NAVY, color: "white" } : { color: "#4b5563" }}
                >
                  {p === "monthly" ? "Monthly" : "Annual"}
                  {p === "annual" && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none" style={{ backgroundColor: CYAN, color: NAVY }}>
                      {ANNUAL_SAVINGS_LABEL}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {native ? (
            <button
              type="button"
              onClick={() => run("purchase", () => purchase(product.id))}
              disabled={busy !== null}
              className="mt-3 w-full h-12 rounded-xl text-base font-bold text-white transition active:opacity-80 disabled:opacity-60"
              style={{ backgroundColor: NAVY }}
            >
              {busy === "purchase" ? "Opening the App Store…" : ctaLabel}
            </button>
          ) : (
            <div className="mt-3 w-full rounded-xl px-4 py-3 text-center text-sm font-semibold" style={{ backgroundColor: "rgba(0,28,72,0.07)", color: NAVY }}>
              Subscribe in the Ball Masters iPhone app
            </div>
          )}

          {/* Two lines reserved so the sheet doesn't jump when the period changes. */}
          <p className="mt-2 text-xs text-gray-500 text-center leading-snug" style={{ minHeight: "2.75em" }}>{finePrint}</p>

          {notice && (
            <p
              role="status"
              className={`mt-1.5 text-xs text-center font-medium ${
                notice.tone === "ok" ? "text-green-700" : notice.tone === "error" ? "text-red-600" : "text-gray-700"
              }`}
            >
              {notice.text}
            </p>
          )}

          <div className="mt-0.5 flex items-center justify-center flex-wrap text-xs font-semibold" style={{ color: NAVY }}>
            <button type="button" onClick={() => run("restore", restorePurchases)} disabled={busy !== null} className="min-h-11 px-2 disabled:opacity-50">
              {busy === "restore" ? "Restoring…" : "Restore purchases"}
            </button>
            <span aria-hidden="true" className="text-gray-300">·</span>
            <button type="button" onClick={() => run("redeem", presentCodeRedemption)} disabled={busy !== null} className="min-h-11 px-2 disabled:opacity-50">
              Redeem code
            </button>
            <span aria-hidden="true" className="text-gray-300">·</span>
            <Link href="/terms" className="min-h-11 px-2 inline-flex items-center">Terms</Link>
            <span aria-hidden="true" className="text-gray-300">·</span>
            <Link href="/privacy" className="min-h-11 px-2 inline-flex items-center">Privacy</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
