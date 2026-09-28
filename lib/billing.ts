// Billing seam. Every purchase-related call in the UI goes through here.
//
// Web: no purchases. The paywall shows "Subscribe in the Ball Masters iPhone
// app" instead of buy buttons, and restore/redeem explain the same. Prices
// come from the USD catalog in lib/plans.ts.
//
// iPhone app (1.1+ binary, RevenueCat plugin present — see lib/nativeApp.ts):
//   - configurePurchases() once per launch with NEXT_PUBLIC_REVENUECAT_IOS_KEY
//     (the public iOS SDK key; inlined at build time, never hard-coded).
//   - syncBillingUser() mirrors the Firebase user: Purchases.logIn(uid) after
//     sign-in, logOut() on sign-out. The webhook expects app_user_id == uid.
//   - getOfferings() reads offering "default" (packages coached_monthly,
//     coached_annual, access_monthly, access_annual), matches them to the
//     catalog by product id, and returns StoreKit's localized prices and
//     whether this Apple ID can still get the free trial.
//   - purchase / restorePurchases / presentCodeRedemption go through the SDK,
//     then ask the server to re-read the subscription (/api/billing/refresh)
//     so the app unlocks without waiting for the webhook.
//
// In the 1.0 binary (no RevenueCat plugin) nothing here touches native code;
// the paywall asks people to update the app instead.

import { useSyncExternalStore } from "react";
import type { CustomerInfo, PurchasesPackage } from "@revenuecat/purchases-capacitor";
import { auth } from "@/lib/firebase";
import { hasNativePlugin, isNativeApp } from "@/lib/nativeApp";
import { PRODUCTS, type BillingPeriod, type PaidPlan } from "@/lib/plans";

export type BillingResult =
  | { ok: true; message?: string }
  | { ok: false; reason: "cancelled" | "unavailable" | "pending" | "not_found" | "error"; message: string };

/** One purchasable plan/period as the paywall shows it. */
export interface Offer {
  productId: string;
  plan: PaidPlan;
  period: BillingPeriod;
  /** RevenueCat package id; null on the web or when the store isn't offering it. */
  packageId: string | null;
  /** StoreKit's localized price in the app; the USD catalog price otherwise. */
  priceString: string;
  unit: "month" | "year";
  /** Free-trial length this person can get on it right now, else null. */
  trialDays: number | null;
}

/** RevenueCat offering and package identifiers (RevenueCat dashboard). */
const OFFERING_ID = "default";
const PACKAGE_IDS = ["coached_monthly", "coached_annual", "access_monthly", "access_annual"];

const WEB_MESSAGE = "Subscriptions are managed in the Ball Masters iPhone app.";
const UPDATE_MESSAGE = "Update Ball Masters from the App Store to subscribe in the app.";

/** The binary can take purchases (1.1+). */
export function isNativeBillingAvailable(): boolean {
  return hasNativePlugin("Purchases");
}

/** Running in an older app build that has no purchase support. */
export function nativeBillingNeedsUpdate(): boolean {
  return isNativeApp() && !hasNativePlugin("Purchases");
}

function unavailable(): BillingResult {
  return { ok: false, reason: "unavailable", message: nativeBillingNeedsUpdate() ? UPDATE_MESSAGE : WEB_MESSAGE };
}

function catalogOffers(): Offer[] {
  return PRODUCTS.map(p => ({
    productId: p.id,
    plan: p.plan,
    period: p.period,
    packageId: null,
    priceString: p.price,
    unit: p.unit,
    trialDays: p.trialDays,
  }));
}

// ---------------------------------------------------------------------------
// RevenueCat SDK plumbing (native only; the module is loaded on demand).
// ---------------------------------------------------------------------------

type PurchasesModule = typeof import("@revenuecat/purchases-capacitor");
let modulePromise: Promise<PurchasesModule> | null = null;
function loadPurchases(): Promise<PurchasesModule> {
  return (modulePromise ??= import("@revenuecat/purchases-capacitor"));
}

let configured: Promise<boolean> | null = null;
let lastEntitlementsKey: string | null = null;
const packagesById = new Map<string, PurchasesPackage>();

/** Configures the SDK once per launch. False when unavailable or not set up. */
function configurePurchases(): Promise<boolean> {
  if (!isNativeBillingAvailable()) return Promise.resolve(false);
  return (configured ??= (async () => {
    const apiKey = process.env.NEXT_PUBLIC_REVENUECAT_IOS_KEY;
    if (!apiKey) {
      console.warn("[billing] NEXT_PUBLIC_REVENUECAT_IOS_KEY is not set — purchases disabled");
      return false;
    }
    const { Purchases } = await loadPurchases();
    await Purchases.configure({ apiKey, appUserID: auth.currentUser?.uid ?? null });
    // Renewals, offer-code redemptions and Ask to Buy approvals arrive here.
    await Purchases.addCustomerInfoUpdateListener(onCustomerInfo);
    return true;
  })().catch(err => {
    console.error("[billing] RevenueCat configure failed", err);
    configured = null;
    return false;
  }));
}

function onCustomerInfo(info: CustomerInfo) {
  const key = Object.keys(info.entitlements.active).sort().join(",") + "|" + (info.latestExpirationDate ?? "");
  const first = lastEntitlementsKey === null;
  const changed = key !== lastEntitlementsKey;
  lastEntitlementsKey = key;
  // The first delivery is just the current state; react to real changes.
  if (!first && changed) void refreshPlanFromServer();
}

/**
 * Re-resolve the signed-in user's plan on the server from RevenueCat's
 * current view of their subscription (the webhook does the same later).
 */
export async function refreshPlanFromServer(): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  try {
    const token = await user.getIdToken();
    await fetch("/api/billing/refresh", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  } catch (err) {
    console.error("[billing] plan refresh failed", err);
  }
}

let userSync: Promise<void> = Promise.resolve();
let syncedUid: string | null | undefined;

/** Mirror the Firebase user into RevenueCat. Called from AuthProvider on every auth change. */
export function syncBillingUser(uid: string | null): Promise<void> {
  if (!isNativeBillingAvailable()) return Promise.resolve();
  userSync = userSync.then(async () => {
    if (uid === syncedUid) return;
    try {
      if (!(await configurePurchases())) return;
      const { Purchases } = await loadPurchases();
      if (uid) {
        await Purchases.logIn({ appUserID: uid });
      } else {
        const { isAnonymous } = await Purchases.isAnonymous();
        if (!isAnonymous) await Purchases.logOut();
      }
      syncedUid = uid;
      lastEntitlementsKey = null;
    } catch (err) {
      console.error("[billing] could not sync the RevenueCat user", err);
    }
  });
  return userSync;
}

function trialDaysOf(pkg: PurchasesPackage, fallback: number | null): number | null {
  const intro = pkg.product.introPrice;
  if (!intro || intro.price !== 0) return fallback;
  const n = intro.periodNumberOfUnits;
  if (intro.periodUnit === "DAY") return n;
  if (intro.periodUnit === "WEEK") return 7 * n;
  return fallback;
}

/** Plans for the paywall: live store prices and trial eligibility in the app, the catalog elsewhere. */
export async function getOfferings(): Promise<Offer[]> {
  const catalog = catalogOffers();
  if (!isNativeBillingAvailable()) return catalog;
  try {
    if (!(await configurePurchases())) return catalog;
    const { Purchases, INTRO_ELIGIBILITY_STATUS } = await loadPurchases();
    const offerings = await Purchases.getOfferings();
    const offering = offerings.all[OFFERING_ID] ?? offerings.current;
    if (!offering) return catalog;

    const byProduct = new Map<string, PurchasesPackage>();
    for (const pkg of offering.availablePackages) {
      if (!PACKAGE_IDS.includes(pkg.identifier)) continue;
      byProduct.set(pkg.product.identifier, pkg);
      packagesById.set(pkg.identifier, pkg);
    }

    // "Start 7-day free trial" only for people Apple will actually give one to.
    const trialProducts = catalog.filter(o => o.trialDays && byProduct.has(o.productId)).map(o => o.productId);
    let eligibility: Record<string, { status: number }> = {};
    if (trialProducts.length > 0) {
      try {
        eligibility = await Purchases.checkTrialOrIntroductoryPriceEligibility({ productIdentifiers: trialProducts });
      } catch (err) {
        console.error("[billing] trial eligibility check failed", err);
      }
    }

    return catalog.map(o => {
      const pkg = byProduct.get(o.productId);
      if (!pkg) return { ...o, packageId: null, trialDays: null };
      const eligible = eligibility[o.productId]?.status === INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE;
      return {
        ...o,
        packageId: pkg.identifier,
        priceString: pkg.product.priceString,
        trialDays: eligible ? trialDaysOf(pkg, o.trialDays) : null,
      };
    });
  } catch (err) {
    console.error("[billing] could not load offerings", err);
    return catalog;
  }
}

/** Plain-English outcome for a failed StoreKit/RevenueCat call. */
function describeError(err: unknown): BillingResult {
  const e = err as { code?: unknown; userCancelled?: unknown; data?: { userCancelled?: unknown } };
  const code = e?.code == null ? "" : String(e.code);
  if (code === "1" || e?.userCancelled === true || e?.data?.userCancelled === true) {
    return { ok: false, reason: "cancelled", message: "" };
  }
  switch (code) {
    case "20": // PAYMENT_PENDING_ERROR — Ask to Buy, or a payment that needs action
      return {
        ok: false,
        reason: "pending",
        message: "Your purchase is waiting for approval (for example Ask to Buy). Your plan unlocks as soon as it's approved.",
      };
    case "6": // PRODUCT_ALREADY_PURCHASED_ERROR
      return {
        ok: false,
        reason: "error",
        message: "This Apple ID already has this subscription. Tap Restore purchases to unlock it here.",
      };
    case "7": // RECEIPT_ALREADY_IN_USE_ERROR
    case "13": // RECEIPT_IN_USE_BY_OTHER_SUBSCRIBER_ERROR
      return {
        ok: false,
        reason: "error",
        message: "This Apple ID's subscription belongs to a different Ball Masters account. Sign in to that account, or contact us.",
      };
    case "3": // PURCHASE_NOT_ALLOWED_ERROR
      return {
        ok: false,
        reason: "error",
        message: "Purchases aren't allowed on this iPhone. Check Screen Time › Content & Privacy Restrictions.",
      };
    case "5": // PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR
      return { ok: false, reason: "unavailable", message: "This plan isn't available to buy right now. Please try again later." };
    case "10": // NETWORK_ERROR
    case "35": // OFFLINE_CONNECTION_ERROR
      return { ok: false, reason: "error", message: "No internet connection. Check your connection and try again." };
    case "2": // STORE_PROBLEM_ERROR
      return { ok: false, reason: "error", message: "The App Store had a problem. Please try again in a moment." };
    case "15": // OPERATION_ALREADY_IN_PROGRESS_ERROR
      return { ok: false, reason: "error", message: "A purchase is already in progress." };
    default:
      return { ok: false, reason: "error", message: "Something went wrong with the App Store. Please try again." };
  }
}

const NOT_SET_UP: BillingResult = {
  ok: false,
  reason: "unavailable",
  message: "Purchases aren't set up yet. Please try again later.",
};

/** Buy (or upgrade to) a package. Access → Coached is a normal purchase; Apple prorates within the group. */
export async function purchase(packageId: string | null): Promise<BillingResult> {
  if (!isNativeBillingAvailable()) return unavailable();
  if (!packageId) return { ok: false, reason: "unavailable", message: "This plan isn't available to buy right now. Please try again later." };
  try {
    if (!(await configurePurchases())) return NOT_SET_UP;
    if (!packagesById.has(packageId)) await getOfferings();
    const pkg = packagesById.get(packageId);
    if (!pkg) return { ok: false, reason: "unavailable", message: "This plan isn't available to buy right now. Please try again later." };
    const { Purchases } = await loadPurchases();
    await Purchases.purchasePackage({ aPackage: pkg });
    await refreshPlanFromServer();
    return { ok: true };
  } catch (err) {
    return describeError(err);
  }
}

export async function restorePurchases(): Promise<BillingResult> {
  if (!isNativeBillingAvailable()) return unavailable();
  try {
    if (!(await configurePurchases())) return NOT_SET_UP;
    const { Purchases } = await loadPurchases();
    const { customerInfo } = await Purchases.restorePurchases();
    await refreshPlanFromServer();
    const active = Object.keys(customerInfo.entitlements.active);
    if (active.includes("access") || active.includes("coached")) {
      return { ok: true, message: "Purchases restored. Unlocking…" };
    }
    return { ok: false, reason: "not_found", message: "No active Ball Masters subscription was found for this Apple ID." };
  } catch (err) {
    return describeError(err);
  }
}

/** Apple's offer-code sheet. The redemption itself arrives through the customer-info listener. */
export async function presentCodeRedemption(): Promise<BillingResult> {
  if (!isNativeBillingAvailable()) return unavailable();
  try {
    if (!(await configurePurchases())) return NOT_SET_UP;
    const { Purchases } = await loadPurchases();
    await Purchases.presentCodeRedemptionSheet();
    return { ok: true, message: "Once your code is redeemed, your plan unlocks automatically." };
  } catch (err) {
    return describeError(err);
  }
}

const noopSubscribe = () => () => {};

/** SSR-safe hook form of isNativeBillingAvailable() (false during server render). */
export function useNativeBillingAvailable(): boolean {
  return useSyncExternalStore(noopSubscribe, isNativeBillingAvailable, () => false);
}

/** SSR-safe hook form of nativeBillingNeedsUpdate(). */
export function useNativeBillingNeedsUpdate(): boolean {
  return useSyncExternalStore(noopSubscribe, nativeBillingNeedsUpdate, () => false);
}
