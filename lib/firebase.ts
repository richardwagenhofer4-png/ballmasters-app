import { initializeApp, getApps, getApp } from "firebase/app";
import {
  initializeAuth,
  getAuth,
  connectAuthEmulator,
  indexedDBLocalPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import { initializeFirestore, getFirestore, connectFirestoreEmulator } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Initialize auth WITHOUT the iframe-based popup/redirect resolver.
// The iframe resolver hangs for 30-60s on iOS standalone PWA mode.
// The login page imports browserPopupRedirectResolver explicitly for Google sign-in.
function makeAuth() {
  try {
    return initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    });
  } catch {
    // initializeAuth throws if already initialized (e.g. hot reload) — fall back to getAuth
    return getAuth(app);
  }
}

export const auth = makeAuth();

function makeDb() {
  try {
    return initializeFirestore(app, {
      experimentalForceLongPolling: true,
    });
  } catch {
    return getFirestore(app);
  }
}

export const db = makeDb();

// Local browser tests only (scripts/test-videos-filter.mjs): when the dev server
// is started with NEXT_PUBLIC_FIREBASE_EMULATOR=true, talk to the local Auth and
// Firestore emulators instead of a Firebase project. The variable is inlined at
// build time and is never set in a deployed build, so this is dead code there.
if (process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === "true") {
  try {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
  } catch {
    // already connected (hot reload)
  }
}
