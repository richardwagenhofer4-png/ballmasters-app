// Billing seam. Every purchase-related call in the UI goes through here so the
// native layer (RevenueCat on iOS, a later build step) can be dropped in
// without touching screens.
//
// Current state — a stub:
//   - On the web, native billing is unavailable; the paywall tells people to
//     subscribe in the Ball Masters iPhone app instead of showing buy buttons.
//   - Inside the Capacitor iOS shell, isNativeBillingAvailable() is true (the
//     paywall shows buy buttons), but purchase/restore/redeem report
//     "unavailable" until the RevenueCat SDK is wired in. The paywall switch is
//     off until then, so no customer can reach these buttons.
//
// When wiring RevenueCat: Purchases.logIn(firebaseUid) before any purchase so
// the webhook's app_user_id is the Firebase uid (app/api/billing/revenuecat).

import { useSyncExternalStore } from "react";
import { Capacitor } from "@capacitor/core";
import { PRODUCTS, type Product } from "@/lib/plans";

export type BillingResult =
  | { ok: true }
  | { ok: false; reason: "cancelled" | "unavailable" | "error"; message: string };

export function isNativeBillingAvailable(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function unavailable(): BillingResult {
  return {
    ok: false,
    reason: "unavailable",
    message: isNativeBillingAvailable()
      ? "In-app purchases aren't available in this version of the app yet."
      : "Subscriptions are managed in the Ball Masters iPhone app.",
  };
}

/** Products on offer. The native layer will return live store prices; the stub returns the catalog. */
export async function getOfferings(): Promise<Product[]> {
  return [...PRODUCTS];
}

export async function purchase(productId: string): Promise<BillingResult> {
  if (!PRODUCTS.some(p => p.id === productId)) {
    return { ok: false, reason: "error", message: "Unknown product." };
  }
  return unavailable();
}

export async function restorePurchases(): Promise<BillingResult> {
  return unavailable();
}

/** Opens the App Store offer-code redemption sheet. */
export async function presentCodeRedemption(): Promise<BillingResult> {
  return unavailable();
}

const noopSubscribe = () => () => {};

/** SSR-safe hook form of isNativeBillingAvailable() (false during server render). */
export function useNativeBillingAvailable(): boolean {
  return useSyncExternalStore(noopSubscribe, isNativeBillingAvailable, () => false);
}
