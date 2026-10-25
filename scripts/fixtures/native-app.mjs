// A stand-in for Capacitor's iOS bridge, for the browser tests. Passed to
// context.addInitScript(installNativeApp, config): it makes the page believe it
// is the 1.1 iPhone app (Purchases, FirebaseMessaging and FirebaseAuthentication
// "installed"), answers Google sign-in with a fake ID token the Auth emulator
// accepts, and (when config.pushToken is set) reports push permission granted
// and that device token. Everything else the app asks the native side answers
// with {}.
//
// This function runs INSIDE the page, so it must not use anything outside itself.
//
//   config = {
//     googleEmail?: string, googleSub?: string,   who Google signs in as
//     pushToken?: string,                         push permission granted + this device token
//     googleDelayMs?: number,                     the Google sheet stays open this long
//     googleError?: string,                       the Google sheet fails with this error code
//     googleCancel?: boolean,                     the person closes the Google sheet
//     keyboard?: boolean,                         the keyboard plugin is "installed" (a later 1.1 build)
//   }
//
// Every native call is recorded in window.__nativeCalls as [plugin, method, options].

export function installNativeApp(config) {
  window.webkit = { messageHandlers: { bridge: { postMessage() {} } } };
  const push = typeof config.pushToken === "string";
  window.__nativeCalls = [];
  window.Capacitor = {
    PluginHeaders: [
      { name: "Purchases", methods: [] },
      { name: "FirebaseMessaging", methods: push ? ["checkPermissions", "requestPermissions", "getToken", "addListener"].map(name => ({ name, rtype: "promise" })) : [] },
      { name: "FirebaseAuthentication", methods: [{ name: "signInWithGoogle", rtype: "promise" }, { name: "signInWithApple", rtype: "promise" }] },
      ...(config.keyboard ? [{ name: "Keyboard", methods: ["setAccessoryBarVisible", "hide", "setResizeMode", "getResizeMode", "setScroll", "setStyle", "addListener", "removeAllListeners"].map(name => ({ name, rtype: "promise" })) }] : []),
    ],
    nativePromise: async (plugin, method, options) => {
      window.__nativeCalls.push([plugin, method, options ?? null]);
      if (plugin === "Keyboard") return method === "addListener" ? { remove: async () => {} } : {};
      if (plugin === "FirebaseAuthentication" && method === "signInWithGoogle") {
        if (config.googleDelayMs) await new Promise(resolve => setTimeout(resolve, config.googleDelayMs));
        if (config.googleCancel) throw new Error("The user canceled the sign-in flow.");
        if (config.googleError) throw Object.assign(new Error("native sign-in failed"), { code: config.googleError });
        return { credential: { idToken: JSON.stringify({ sub: config.googleSub ?? "google-test-1", email: config.googleEmail ?? "google@example.test", email_verified: true }) } };
      }
      if (plugin === "FirebaseMessaging" && push) {
        if (method === "checkPermissions" || method === "requestPermissions") return { receive: "granted" };
        if (method === "getToken") return { token: config.pushToken };
        if (method === "addListener") return { remove: async () => {} };
      }
      return {};
    },
  };
}
