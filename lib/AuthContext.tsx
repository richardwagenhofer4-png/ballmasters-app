"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { syncBillingUser } from "@/lib/billing";
import { loginTrace } from "@/lib/loginDiagnostics";
import { lastActive } from "@/lib/lastActive";

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Seed from currentUser if already available (instant on warm sessions)
  const [user, setUser] = useState<User | null>(auth.currentUser);
  // If we already have a user synchronously, don't show loading at all
  const [loading, setLoading] = useState(auth.currentUser === null);

  useEffect(() => {
    // If an earlier launch's login never finished, report it now (bug 2 evidence).
    loginTrace.checkPrevious();

    // Safety timeout: if onAuthStateChanged hasn't fired in 3s, stop blocking.
    // On iOS PWA the listener can take 30s; currentUser is reliable enough to proceed.
    const timeout = setTimeout(() => {
      loginTrace.step("auth_listener_not_fired_3s", { hasCurrentUser: auth.currentUser !== null }, "warning");
      setLoading(false);
    }, 3000);

    const unsub = onAuthStateChanged(auth, (u) => {
      loginTrace.step("auth_state", { signedIn: u !== null });
      setUser(u);
      setLoading(false);
      clearTimeout(timeout);
      // Refresh users/{uid}.lastActiveAt so the retention job sees real usage,
      // not just logins: once a day per device, fire-and-forget. It is only
      // REQUESTED here. lib/lastActive.ts holds the write back until the first
      // profile read has finished (a write in flight at the same moment as that
      // read could make it answer "missing": Build 1.1 bug 2). The login page
      // asks for the same write after its own read; both collapse into one.
      if (u) lastActive.request(u.uid);
      // iPhone app 1.1+: keep RevenueCat's user identical to the Firebase
      // user (logIn / logOut). A no-op on the web and in older app builds.
      void syncBillingUser(u?.uid ?? null);
    });
    return () => {
      unsub();
      clearTimeout(timeout);
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
