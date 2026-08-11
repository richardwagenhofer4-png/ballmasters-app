"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true });

// Refresh users/{uid}.lastActiveAt so the retention job sees real usage, not
// just logins. Fire-and-forget (never awaited, never throws into the auth
// flow), throttled to at most one write per user per local calendar day via a
// localStorage marker. Login/page.tsx also writes this on login; the throttle
// suppresses the duplicate.
function markLastActive(uid: string) {
  const now = new Date();
  const today =
    `${now.getFullYear()}-` +
    `${String(now.getMonth() + 1).padStart(2, "0")}-` +
    `${String(now.getDate()).padStart(2, "0")}`;
  const key = `lastActiveWrite:${uid}`;

  let canPersist = true;
  try {
    const last = localStorage.getItem(key);
    // YYYY-MM-DD sorts chronologically as a string — skip if already written today.
    if (last && last >= today) return;
  } catch {
    // localStorage unavailable — just write, and don't try to persist the marker.
    canPersist = false;
  }

  updateDoc(doc(db, "users", uid), { lastActiveAt: serverTimestamp() })
    .then(() => {
      if (canPersist) {
        try {
          localStorage.setItem(key, today);
        } catch {
          // ignore — the write still succeeded
        }
      }
    })
    .catch(console.error);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Seed from currentUser if already available (instant on warm sessions)
  const [user, setUser] = useState<User | null>(auth.currentUser);
  // If we already have a user synchronously, don't show loading at all
  const [loading, setLoading] = useState(auth.currentUser === null);

  useEffect(() => {
    // Safety timeout: if onAuthStateChanged hasn't fired in 3s, stop blocking.
    // On iOS PWA the listener can take 30s; currentUser is reliable enough to proceed.
    const timeout = setTimeout(() => setLoading(false), 3000);

    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      clearTimeout(timeout);
      if (u) markLastActive(u.uid);
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
