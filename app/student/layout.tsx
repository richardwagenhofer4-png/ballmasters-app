import { EntitlementsProvider } from "@/lib/EntitlementsContext";
import StudentPaywallGate from "@/components/StudentPaywallGate";

// Every /student route shares one entitlements listener and the paywall gate.
// With the paywall switch off both are pass-throughs.
export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <EntitlementsProvider>
      <StudentPaywallGate>{children}</StudentPaywallGate>
    </EntitlementsProvider>
  );
}
