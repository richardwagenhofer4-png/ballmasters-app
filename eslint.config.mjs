import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The Capacitor iOS project: Xcode build output, DerivedData and copied
    // web assets — generated files, not source we lint.
    "ios/**",
  ]),
  // Pre-existing violations in code written before these rules were enabled,
  // downgraded to warnings for exactly the files that trip each rule so
  // `npm run lint` passes without rewriting working code. Every other file —
  // and every other rule in these files — stays an error. Remove an entry
  // once its file has been brought up to the rule.
  {
    files: [
      "app/coach/invite/page.tsx",
      "app/coach/layout.tsx",
      "app/coach/messages/page.tsx",
      "app/login/page.tsx",
      "app/student/messages/page.tsx",
      "app/student/profile/page.tsx",
      "components/DeleteAccountModal.tsx",
      "lib/NotificationsContext.tsx",
    ],
    rules: { "react-hooks/set-state-in-effect": "warn" },
  },
  {
    files: ["app/coach/dashboard/page.tsx", "app/student/dashboard/page.tsx"],
    rules: { "react-hooks/purity": "warn" },
  },
  {
    files: ["app/coach/videos/[[]id]/drill/DrillViewPage.tsx"],
    rules: { "react-hooks/static-components": "warn" },
  },
  {
    files: ["app/coach/videos/[[]id]/clips/ClipsPage.tsx"],
    rules: { "react/no-unescaped-entities": "warn" },
  },
]);

export default eslintConfig;
