import Link from "next/link";

function FillIn({ text }: { text: string }) {
  return (
    <span className="inline rounded bg-amber-100 px-1 py-0.5 text-xs font-mono font-semibold text-amber-900 border border-amber-300 mx-0.5 whitespace-nowrap">
      FILL IN: {text}
    </span>
  );
}

function ReviewBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700 font-mono leading-relaxed">
      ⚠ LAWYER REVIEW — {children}
    </div>
  );
}

const p = "text-sm text-gray-700 leading-relaxed";
const li = "text-sm text-gray-700 leading-relaxed";

export default function AIDisclosurePage() {
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
              AI Disclosure &amp; Consent
            </h1>
            <p className="text-xs text-gray-400 font-mono">
              Last updated: <FillIn text="DATE" />
            </p>
          </div>

          {/* Lead statement */}
          <div
            className="rounded-xl px-5 py-4 mb-6"
            style={{ backgroundColor: "rgba(1,255,249,0.08)", border: "1px solid rgba(1,255,249,0.3)" }}
          >
            <p className="text-sm font-bold leading-relaxed" style={{ color: "#001c48" }}>
              THIS APP USES ARTIFICIAL INTELLIGENCE (AI) TO TRANSCRIBE VIDEO AUDIO.
            </p>
          </div>

          <p className={p}>
            When a coach uploads a training video, the audio from that video — which may include your child&rsquo;s voice — may be sent to a third-party AI service (OpenAI&rsquo;s Whisper) to automatically convert speech into text. This transcript helps coaches give better feedback.
          </p>

          {/* Consent items */}
          <h2 className="mt-8 mb-3 text-xs font-bold uppercase tracking-widest text-gray-500 border-b border-gray-200 pb-1">
            What You&rsquo;re Consenting To
          </h2>
          <p className="mb-3 text-sm text-gray-600">
            By creating an account and using Ball Masters Florida, you understand and consent that:
          </p>
          <ul className="space-y-3 list-disc list-outside ml-4">
            <li className={li}>Video audio may be processed by OpenAI&rsquo;s transcription service.</li>
            <li className={li}>This may include audio of a minor for whom you are the parent/legal guardian.</li>
            <li className={li}>
              <FillIn text="once arranged" /> For children under 13, this processing is performed under OpenAI&rsquo;s Zero Data Retention terms, so the audio is not retained by OpenAI after transcription.
            </li>
            <li className={li}>AI transcripts may contain errors and are used only to assist coaching.</li>
            <li className={li}>You can withdraw consent at any time by deleting the account, which stops further AI processing of that account&rsquo;s content.</li>
          </ul>

          <ReviewBlock>
            Confirm this consent language and placement satisfy Apple&rsquo;s external-AI consent requirement and COPPA verifiable-consent standards.
          </ReviewBlock>

          {/* Cross-links */}
          <div className="mt-12 pt-6 border-t border-gray-200">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Also see</p>
            <div className="flex flex-wrap gap-4">
              <Link href="/privacy" className="text-sm font-semibold hover:underline" style={{ color: "#001c48" }}>
                Privacy Policy →
              </Link>
              <Link href="/terms" className="text-sm font-semibold hover:underline" style={{ color: "#001c48" }}>
                Terms of Service →
              </Link>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
