// Preloaded into the local `next dev` used by the browser tests (NODE_OPTIONS=--require):
// refuses outbound connections to Sentry, so test runs never send events to the
// real Sentry project from the server side (the browser side is blocked by the test).
const isSentry = h => typeof h === "string" && /(^|\.)sentry\.io$/.test(h);
for (const name of ["http", "https"]) {
  const mod = require(name);
  const request = mod.request;
  mod.request = function (...args) {
    const o = args[0];
    const host = typeof o === "string" ? new URL(o).hostname : o instanceof URL ? o.hostname : o?.hostname ?? o?.host;
    if (isSentry(host)) throw new Error("sentry blocked in tests");
    return request.apply(this, args);
  };
}
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = typeof input === "string" ? input : input?.url ?? String(input);
  try { if (isSentry(new URL(url).hostname)) return Promise.reject(new Error("sentry blocked in tests")); } catch { /* relative URL */ }
  return realFetch(input, init);
};
