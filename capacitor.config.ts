import type { CapacitorConfig } from '@capacitor/cli';

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
