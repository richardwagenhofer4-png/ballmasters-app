import Link from "next/link";

function FillIn({ text }: { text: string }) {
  return (
    <span className="inline rounded bg-amber-100 px-1 py-0.5 text-xs font-mono font-semibold text-amber-900 border border-amber-300 mx-0.5 whitespace-nowrap">
      FILL IN: {text}
    </span>
  );
}

function ReviewBlock({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") return null;
  return (
    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700 font-mono leading-relaxed">
      ⚠ LAWYER REVIEW — {children}
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-8 mb-2 text-xs font-bold uppercase tracking-widest text-gray-500 border-b border-gray-200 pb-1">
      {children}
    </h2>
  );
}

const p = "text-sm text-gray-700 leading-relaxed";
const li = "text-sm text-gray-700 leading-relaxed";

export default function PrivacyPage() {
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
              Privacy Policy
            </h1>
            <p className="text-xs text-gray-400 font-mono">
              Last updated: August 9, 2026
            </p>
          </div>

          {/* WHO WE ARE */}
          <H2>Who We Are</H2>
          <p className={p}>
            Ball Masters Florida (&ldquo;we,&rdquo; &ldquo;us,&rdquo; &ldquo;our&rdquo;) operates the Ball Masters Florida application (the &ldquo;App&rdquo;), a private video coaching platform used by Ball Masters USA LLC to share training videos, coaching feedback, scheduling, and messaging between coaches and athletes. You may see two different company names, so to be clear: the App is operated by RW App Ventures LLC, a Florida limited liability company, which licenses it for use by Ball Masters USA LLC, a Florida limited liability company — the soccer school whose coaches and athletes use the App. RW App Ventures LLC is located at <FillIn text="BUSINESS_ADDRESS — PENDING" />. Contact for privacy questions: privacy@rwappventures.com or +1 (561) 887-5689.
          </p>

          {/* CHILDREN'S PRIVACY */}
          <H2>Children&rsquo;s Privacy — Please Read First (COPPA)</H2>
          <p className={p}>
            The App is used by children, including children under 13. We comply with the U.S. Children&rsquo;s Online Privacy Protection Act (COPPA).
          </p>
          <ul className="mt-3 space-y-2.5 list-disc list-outside ml-4">
            <li className={li}>Accounts for athletes under 18 are created by a parent or legal guardian, who provides consent before any of the child&rsquo;s personal information is collected. For athletes under 13, the parent/guardian creates, owns, and manages the account.</li>
            <li className={li}>A parent/guardian who creates an account consents to our collection and use of their child&rsquo;s information as described in this policy, including the AI transcription described below.</li>
            <li className={li}>Parents/guardians can review their child&rsquo;s information, request corrections, request deletion, and withdraw consent at any time using the in-app account deletion feature or by contacting us. Withdrawing consent or deleting the account removes the child&rsquo;s personal data and videos as described in &ldquo;Data Retention.&rdquo;</li>
            <li className={li}>We collect only information reasonably necessary for the coaching service.</li>
          </ul>
          <ReviewBlock>
            Confirm the parental consent mechanism meets the COPPA standard for the data types collected (video of children is sensitive).
          </ReviewBlock>

          {/* INFORMATION WE COLLECT */}
          <H2>Information We Collect</H2>
          <ul className="mt-2 space-y-2.5 list-disc list-outside ml-4">
            <li className={li}><strong>Account information:</strong> name, email address, role, and for athletes, the assigned coach and date of birth.</li>
            <li className={li}><strong>Profile information:</strong> a chosen avatar (icon or initials).</li>
            <li className={li}><strong>Training videos and related content:</strong> videos uploaded by coaches that may depict athletes, plus coach annotations, voiceover, comments, and reactions.</li>
            <li className={li}><strong>Audio/transcripts:</strong> audio from videos may be transcribed to text (see &ldquo;AI Processing&rdquo;).</li>
            <li className={li}><strong>Scheduling and messaging:</strong> session bookings, waitlist entries, and 1-to-1 messages between an athlete (or guardian) and their coach.</li>
            <li className={li}><strong>Usage data:</strong> which videos have been watched, activity for notifications, and standard technical/diagnostic data.</li>
          </ul>

          {/* HOW WE USE INFORMATION */}
          <H2>How We Use Information</H2>
          <ul className="mt-2 space-y-2.5 list-disc list-outside ml-4">
            <li className={li}>To provide the coaching service: deliver videos, feedback, scheduling, messaging, and notifications.</li>
            <li className={li}>To transcribe video audio to text to support coaching (see &ldquo;AI Processing&rdquo;).</li>
            <li className={li}>To operate, secure, maintain, and improve the App.</li>
            <li className={li}>To communicate service-related messages.</li>
          </ul>
          <p className="mt-3 text-sm font-semibold text-gray-800">
            We do not sell personal information. We do not use children&rsquo;s data for advertising or marketing.
          </p>

          {/* AI PROCESSING */}
          <H2>AI Processing (Transcription)</H2>
          <p className={p}>
            The App uses a third-party AI service (OpenAI&rsquo;s Whisper API) to transcribe audio from training videos into text. This means video audio — which may include a child&rsquo;s voice — is sent to OpenAI for processing.
          </p>
          <ul className="mt-3 space-y-2.5 list-disc list-outside ml-4">
            <li className={li}>Transcription is disabled for users under 13, so their video audio is never sent to OpenAI.</li>
            <li className={li}>Parents/guardians consent to this AI processing at sign-up.</li>
          </ul>

          {/* SUB-PROCESSORS */}
          <H2>Who We Share Information With (Sub-Processors)</H2>
          <p className={p}>
            We share information only with service providers who help us run the App, under contracts that require them to protect it:
          </p>
          <ul className="mt-3 space-y-2.5 list-disc list-outside ml-4">
            <li className={li}><strong>Google Firebase (Google LLC)</strong> — authentication and database hosting.</li>
            <li className={li}><strong>Cloudflare R2 (Cloudflare, Inc.)</strong> — video file storage.</li>
            <li className={li}><strong>OpenAI (OpenAI, L.L.C.)</strong> — audio transcription.</li>
            <li className={li}><strong>Vercel (Vercel, Inc.)</strong> — app hosting.</li>
          </ul>
          <p className="mt-3 text-sm text-gray-700 leading-relaxed">
            We may disclose information if required by law or to protect safety.
          </p>
          <ReviewBlock>
            Confirm each sub-processor&rsquo;s terms permit processing of children&rsquo;s data.
          </ReviewBlock>

          {/* DATA RETENTION */}
          <H2>Data Retention</H2>
          <ul className="mt-2 space-y-2.5 list-disc list-outside ml-4">
            <li className={li}>Account information, videos, transcripts, messages, and related data are retained while the account is active.</li>
            <li className={li}>When an account is deleted, the associated personal data and videos are removed from our systems and the login is deleted.</li>
            <li className={li}>Accounts and videos inactive for 12 months will be deleted.</li>
          </ul>

          {/* SECURITY */}
          <H2>Security</H2>
          <p className={p}>
            We use reasonable technical and organizational measures to protect information, including authenticated access, access controls, and encrypted storage/transport. No system is perfectly secure.
          </p>

          {/* YOUR RIGHTS */}
          <H2>Your Rights / Parental Rights</H2>
          <p className={p}>
            Parents/guardians (and adult users) may access, correct, or delete their information, delete the account, and withdraw consent via in-app account deletion or by contacting us.
          </p>
          <ReviewBlock>
            Add state-law rights (e.g. CCPA) if applicable.
          </ReviewBlock>

          {/* CHANGES */}
          <H2>Changes to This Policy</H2>
          <p className={p}>
            We may update this policy; we will post the new version with an updated date and, for material changes affecting children&rsquo;s data, obtain renewed parental consent where required.
          </p>

          {/* CONTACT */}
          <H2>Contact</H2>
          <p className={p}>
            privacy@rwappventures.com &middot; +1 (561) 887-5689 &middot; <FillIn text="BUSINESS_ADDRESS — PENDING" />
          </p>

          {/* Cross-links */}
          <div className="mt-12 pt-6 border-t border-gray-200">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Also see</p>
            <div className="flex flex-wrap gap-4">
              <Link href="/terms" className="text-sm font-semibold hover:underline" style={{ color: "#001c48" }}>
                Terms of Service →
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
