import Link from "next/link";

function ReviewBlock({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") return null;
  return (
    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700 font-mono leading-relaxed">
      ⚠ LAWYER REVIEW — {children}
    </div>
  );
}

function H2({ num, children }: { num: number; children: React.ReactNode }) {
  return (
    <h2 className="mt-8 mb-2 text-sm font-bold text-gray-900 border-b border-gray-200 pb-1">
      {num}. {children}
    </h2>
  );
}

const p = "text-sm text-gray-700 leading-relaxed";
const li = "text-sm text-gray-700 leading-relaxed";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header style={{ backgroundColor: "#001c48", paddingTop: "env(safe-area-inset-top)" }}>
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <img src="/logo-light.png" alt="Ball Masters Florida" style={{ height: 32, width: "auto" }} />
          <Link href="/register" className="text-sm font-medium text-gray-300 hover:text-white transition">
            ← Back to registration
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-10 pb-16">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 px-6 py-8 sm:px-10">

          {/* Title */}
          <div className="mb-8">
            <h1 className="text-2xl font-extrabold mb-1.5" style={{ color: "#001c48" }}>
              Terms of Service
            </h1>
            <p className="text-xs text-gray-400 font-mono">
              Last updated: August 11, 2026
            </p>
          </div>

          {/* 1. AGREEMENT */}
          <H2 num={1}>Agreement</H2>
          <p className={p}>
            These Terms govern your use of the Ball Masters Florida App operated by RW App Ventures LLC, a Florida LLC (&ldquo;we&rdquo;). By creating an account or using the App, you agree to these Terms. If you do not agree, do not use the App.
          </p>

          {/* 2. ELIGIBILITY */}
          <H2 num={2}>Eligibility and Accounts</H2>
          <ul className="mt-2 space-y-2.5 list-disc list-outside ml-4">
            <li className={li}>The App is a private platform for Ball Masters USA LLC and its coaches and athletes. Access requires a valid invitation.</li>
            <li className={li}>Accounts for athletes under 13 must be created and managed by a parent or legal guardian, who agrees to these Terms on the child&rsquo;s behalf. Athletes 13 and older may create their own accounts and agree to these Terms themselves.</li>
            <li className={li}>You must provide accurate information and keep your login credentials secure. You are responsible for activity under your account.</li>
          </ul>

          {/* 3. ACCEPTABLE USE */}
          <H2 num={3}>Acceptable Use</H2>
          <p className={p}>
            You agree not to: misuse the App; upload unlawful, harmful, or infringing content; attempt to access other users&rsquo; data without authorization; disrupt or reverse-engineer the service; or use the App other than for its intended coaching purpose. Coaches are responsible for ensuring they have the right to upload videos depicting athletes, with appropriate consent from the athlete or, for athletes under 13, from their parent or legal guardian.
          </p>

          {/* 4. CONTENT */}
          <H2 num={4}>Content</H2>
          <ul className="mt-2 space-y-2.5 list-disc list-outside ml-4">
            <li className={li}>Coaches and the school retain responsibility for the training content they upload.</li>
            <li className={li}>You grant us a limited license to host, process, and display content solely to operate the App (including AI transcription as described in the Privacy Policy and AI Disclosure).</li>
            <li className={li}>We may remove content that violates these Terms.</li>
          </ul>

          {/* 5. AI FEATURES */}
          <H2 num={5}>AI Features</H2>
          <p className={p}>
            The App uses third-party AI to transcribe video audio. By using the App you acknowledge the{" "}
            <Link href="/ai-disclosure" className="underline font-medium" style={{ color: "#001c48" }}>AI Disclosure</Link>
            {" "}and the{" "}
            <Link href="/privacy" className="underline font-medium" style={{ color: "#001c48" }}>Privacy Policy</Link>
            . AI output may contain errors and is provided to assist, not replace, coaching judgment.
          </p>

          {/* 6. TERMINATION */}
          <H2 num={6}>Termination</H2>
          <p className={p}>
            We may suspend or terminate access for violation of these Terms. You may delete your account at any time in the App.
          </p>
          <ReviewBlock>
            Add fees/subscription/refund terms if paid subscriptions are introduced.
          </ReviewBlock>

          {/* 7. DISCLAIMERS */}
          <H2 num={7}>Disclaimers and Limitation of Liability</H2>
          <p className={p}>
            The App is provided &ldquo;as is&rdquo; without warranties. To the fullest extent permitted by law, we are not liable for indirect or consequential damages, and our total liability is limited to the greater of the fees paid in the preceding 12 months, or USD $100.
          </p>
          <ReviewBlock>
            This section needs attorney drafting.
          </ReviewBlock>

          {/* 8. GOVERNING LAW */}
          <H2 num={8}>Governing Law</H2>
          <p className={p}>
            These Terms are governed by the laws of the State of Florida, without regard to conflict-of-laws rules.
          </p>
          <ReviewBlock>
            Confirm governing law and jurisdiction.
          </ReviewBlock>

          {/* 9. CONTACT */}
          <H2 num={9}>Contact</H2>
          <p className={p}>
            support@rwappventures.com
          </p>

          {/* Cross-links */}
          <div className="mt-12 pt-6 border-t border-gray-200">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Also see</p>
            <div className="flex flex-wrap gap-4">
              <Link href="/privacy" className="text-sm font-semibold hover:underline" style={{ color: "#001c48" }}>
                Privacy Policy →
              </Link>
              <Link href="/ai-disclosure" className="text-sm font-semibold hover:underline" style={{ color: "#001c48" }}>
                AI Disclosure →
              </Link>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
