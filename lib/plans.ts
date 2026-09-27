// Subscription catalog. Product IDs must match App Store Connect exactly —
// they are the contract with StoreKit / RevenueCat. Do not invent new ones here.

export type PaidPlan = "access" | "coached";
export type BillingPeriod = "monthly" | "annual";

export interface Product {
  id: string;
  plan: PaidPlan;
  period: BillingPeriod;
  /** Display price in USD, e.g. "$49.00". */
  price: string;
  /** "month" | "year" — used in "$49.00/month" style copy. */
  unit: "month" | "year";
  /** Free-trial length on this product, or null when there is none. */
  trialDays: number | null;
}

export const PRODUCTS: readonly Product[] = [
  { id: "com.ballmasters.app.access.monthly", plan: "access", period: "monthly", price: "$49.00", unit: "month", trialDays: 7 },
  { id: "com.ballmasters.app.access.annual", plan: "access", period: "annual", price: "$490.00", unit: "year", trialDays: null },
  { id: "com.ballmasters.app.coached.monthly", plan: "coached", period: "monthly", price: "$99.00", unit: "month", trialDays: 7 },
  { id: "com.ballmasters.app.coached.annual", plan: "coached", period: "annual", price: "$990.00", unit: "year", trialDays: null },
];

export interface PlanCopy {
  id: PaidPlan;
  name: string;
  tagline: string;
  bullets: string[];
}

export const PLANS: Record<PaidPlan, PlanCopy> = {
  access: {
    id: "access",
    name: "Access",
    tagline: "Every training session on video",
    bullets: [
      "Every session on video",
      "Watch, rewatch, share with family",
      "Kept for 12 months",
    ],
  },
  coached: {
    id: "coached",
    name: "Coached",
    tagline: "Everything in Access, plus your coach's breakdowns",
    bullets: [
      "Everything in Access",
      "Coach breakdown every week you train",
      "Coach demo vs. your attempt (drill comparison)",
      "Direct line to your coach",
    ],
  },
};

/** Annual pricing is 10x monthly, i.e. two months free. */
export const ANNUAL_SAVINGS_LABEL = "2 months free";

export function productFor(plan: PaidPlan, period: BillingPeriod): Product {
  const p = PRODUCTS.find(x => x.plan === plan && x.period === period);
  if (!p) throw new Error(`No product for ${plan}/${period}`);
  return p;
}

export function productById(productId: string | null | undefined): Product | null {
  if (!productId) return null;
  return PRODUCTS.find(p => p.id === productId) ?? null;
}

export function planName(plan: "none" | PaidPlan): string {
  return plan === "none" ? "None" : PLANS[plan].name;
}
