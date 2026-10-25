import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

const config: CapacitorConfig = {
  appId: 'com.ballmasters.app',
  appName: 'Ball Masters',
  webDir: 'capacitor-shell',
  server: {
    url: 'https://ballmasters-app.vercel.app',
    cleartext: false,
    allowNavigation: [
      'ballmasters-app.firebaseapp.com',
      'accounts.google.com',
    ],
  },
  plugins: {
    FirebaseAuthentication: {
      // Native Google and Apple sign-in for the iOS shell — bypasses the
      // WKWebView storage-partitioning problem that breaks signInWithPopup
      // with "Unable to process request due to missing initial state". The
      // web layer signs in to the Firebase JS SDK with the returned
      // credential (app/login, app/register).
      skipNativeAuth: false,
      providers: ['google.com', 'apple.com'],
    },
    FirebaseMessaging: {
      // Show pushes as banners (with sound and badge) while the app is open.
      presentationOptions: ['alert', 'badge', 'sound'],
    },
    Keyboard: {
      // 'native': when the keyboard opens, iOS shrinks the whole web view to
      // the area above it (so the visible area is what the page sees as its
      // height, and nothing is panned or covered). The message screens
      // (lib/useKeyboardLayout.ts) already size themselves to the visible area,
      // so this works with them as is, and it is the same layout the web gets
      // from Safari/1.0 with no plugin. 'none' would leave the keyboard on top
      // of the page with nothing telling the page how tall it is; 'body' and
      // 'ionic' resize one element with script, which fights the fixed-height
      // screens. The form accessory bar (up/down arrows + checkmark) is hidden
      // from web code too (components/NativeKeyboardSetup.tsx).
      resize: KeyboardResize.Native,
    },
  },
  experimental: {
    ios: {
      spm: {
        // Required by @capacitor-firebase/messaging to avoid a SwiftPM
        // package identity collision (see its README, Capacitor CLI 8.4.0+).
        packageOptions: {
          '@capacitor-firebase/messaging': { symlink: true },
        },
      },
    },
  },
};

export default config;
