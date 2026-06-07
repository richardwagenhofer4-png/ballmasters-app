"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/lib/firebase";

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
    // Safety timeout: if onAuthStateChanged hasn't fired in 3s, stop blocking.
    // On iOS PWA the listener can take 30s; currentUser is reliable enough to proceed.
    const timeout = setTimeout(() => setLoading(false), 3000);

    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      clearTimeout(timeout);
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
