import { Suspense } from "react";
import type { Metadata } from "next";
import RegisterForm from "./RegisterForm";

// Apple's Smart App Banner (Safari on iPhone/iPad). Register route only: it is
// where invite links land. WKWebView never renders the banner, so the iPhone
// app itself is unaffected.
export const metadata: Metadata = {
  itunes: { appId: "6800971758" },
};

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
