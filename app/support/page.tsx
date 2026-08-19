import Link from "next/link";

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-8 mb-2 text-xs font-bold uppercase tracking-widest text-gray-500 border-b border-gray-200 pb-1">
      {children}
    </h2>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 first:mt-3">
      <p className="text-sm font-semibold text-gray-900 mb-1">{q}</p>
      <div className="text-sm text-gray-700 leading-relaxed">{children}</div>
    </div>
  );
}

const p = "text-sm text-gray-700 leading-relaxed";
const li = "text-sm text-gray-700 leading-relaxed";
const linkStyle = { color: "#001c48" };

export const metadata = {
  title: "Support — Ball Masters",
  description: "Get help with the Ball Masters app.",
};

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header. paddingTop stays inline: a global CSS rule for the safe-area
          inset silently fails on device. */}
      <header style={{ backgroundColor: "#001c48", paddingTop: "env(safe-area-inset-top)" }}>
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <img src="/logo-light.png" alt="Ball Masters Florida" style={{ height: 32, width: "auto" }} />
          <Link href="/login" className="text-sm font-medium text-gray-300 hover:text-white transition shrink-0">
            Sign in →
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-10 pb-16">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 px-6 py-8 sm:px-10">

          {/* Title */}
          <div className="mb-8">
            <h1 className="text-2xl font-extrabold mb-1.5" style={{ color: "#001c48" }}>
              Support
            </h1>
            <p className="text-sm text-gray-500">
              Help with the Ball Masters app for coaches, athletes, and parents.
            </p>
          </div>

          {/* CONTACT */}
          <H2>Contact Us</H2>
          <p className={p}>
            Email{" "}
            <a
              href="mailto:support@rwappventures.com"
              className="font-semibold hover:underline break-all"
              style={linkStyle}
            >
              support@rwappventures.com
            </a>
            {" "}and we will help you sort it out.
          </p>

          <p className="mt-4 text-sm text-gray-700 leading-relaxed">
            To help us find your account quickly, please include:
          </p>
          <ul className="mt-3 space-y-2.5 list-disc list-outside ml-4">
            <li className={li}>The email address on the account.</li>
            <li className={li}>Whether you are a coach, an athlete, or a parent or guardian.</li>
            <li className={li}>Which screen you were on when the problem happened, and what you expected to see.</li>
          </ul>

          {/* WHO OPERATES THE APP */}
          <H2>Who Operates the App</H2>
          <p className={p}>
            Ball Masters Soccer is operated by RW App Ventures LLC.
          </p>

          {/* FAQ */}
          <H2>Common Questions</H2>

          <Faq q="How does an athlete get an account?">
            An invite code is required to register — athletes cannot sign up on their own.
            Your coach provides the code or a registration link containing it. The code is
            what connects the new account to that coach.
          </Faq>

          <Faq q="My child is under 13. Who creates the account?">
            A parent or guardian does. For an athlete under 13, registration asks for the
            parent or guardian&rsquo;s name and email address — the login belongs to the
            parent or guardian, not the child — and the parent or guardian must tick the
            consent box before the account can be created. Athletes aged 13 and over
            register with their own email address.
          </Faq>

          <Faq q="Who can see an athlete's videos?">
            A video is visible to the coach who uploaded it, to the athletes that coach
            assigned it to, and to an administrator. Other athletes cannot see it. The same
            applies to the comments, coach annotations, and voiceover on that video. This is
            enforced on the server, not just hidden in the app.
          </Faq>

          <Faq q="How do I delete my account?">
            You can do it yourself in the app. Athletes and parents: open{" "}
            <span className="font-medium">Profile</span> and choose{" "}
            <span className="font-medium">Delete My Account</span>. Coaches: open{" "}
            <span className="font-medium">Settings</span> and choose the same. You will be
            asked to type DELETE to confirm. If you cannot sign in to reach that screen,
            email us and we will handle it for you.
          </Faq>

          <Faq q="How long is my data kept?">
            Account information, videos, transcripts, and messages are kept while the
            account is active. Deleting an account removes the associated personal data and
            videos and deletes the login. Accounts and videos inactive for 12 months are
            deleted. See the{" "}
            <Link href="/privacy" className="font-semibold hover:underline" style={linkStyle}>
              Privacy Policy
            </Link>{" "}
            for the full detail.
          </Faq>

          <Faq q="I forgot my password.">
            Use{" "}
            <Link href="/forgot-password" className="font-semibold hover:underline" style={linkStyle}>
              Forgot password
            </Link>{" "}
            to have a reset link emailed to you. For an athlete under 13, that link goes to
            the parent or guardian&rsquo;s email address, since that is the login on the
            account.
          </Faq>

          {/* Cross-links */}
          <div className="mt-12 pt-6 border-t border-gray-200">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Also see</p>
            <div className="flex flex-wrap gap-4">
              <Link href="/privacy" className="text-sm font-semibold hover:underline" style={linkStyle}>
                Privacy Policy →
              </Link>
              <Link href="/terms" className="text-sm font-semibold hover:underline" style={linkStyle}>
                Terms of Service →
              </Link>
              <Link href="/ai-disclosure" className="text-sm font-semibold hover:underline" style={linkStyle}>
                AI Disclosure →
              </Link>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
