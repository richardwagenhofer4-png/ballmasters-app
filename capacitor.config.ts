import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ballmasters.app.dev',
  appName: 'Ball Masters',
  // SPIKE ONLY (spike/local-bundle): load the locally-bundled static export
  // (produced by `npm run build:static` into out-static/) instead of pointing
  // the WKWebView at the live Vercel site. This is the Guideline-4.2 fix under
  // test. `server.url` is removed so the app serves the bundle from
  // capacitor://localhost; API calls still go to Vercel over the network
  // (which needs the API-base-URL + CORS work described in the report).
  // Do NOT merge this to main.
  webDir: 'out-static',
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
