// "Coach's feedback": the coach's written notes under a video, for the athlete.
// Renders nothing when there is no feedback.

export default function CoachFeedback({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <section className="bg-gray-900 border-t border-gray-800 px-4 py-4" aria-labelledby="coach-feedback-heading">
      <div
        className="rounded-xl px-4 py-4"
        style={{ backgroundColor: "rgba(1,255,249,0.07)", border: "1px solid rgba(1,255,249,0.25)" }}
      >
        <h2 id="coach-feedback-heading" className="text-sm font-bold text-white">
          Coach&rsquo;s feedback
        </h2>
        <p className="mt-2 text-sm text-gray-200 leading-relaxed whitespace-pre-wrap break-words">{text}</p>
      </div>
    </section>
  );
}
