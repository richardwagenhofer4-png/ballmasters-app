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
};

export default config;
