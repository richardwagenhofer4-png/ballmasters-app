import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ballmasters.app',
  appName: 'Ball Masters',
  webDir: 'public',
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
      // Native Google sign-in for the iOS shell — bypasses the WKWebView
      // storage-partitioning problem that breaks signInWithPopup with
      // "Unable to process request due to missing initial state".
      skipNativeAuth: false,
      providers: ['google.com'],
    },
  },
};

export default config;
