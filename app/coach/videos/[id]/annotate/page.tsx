import dynamic from "next/dynamic";

const AnnotatePage = dynamic(() => import("./AnnotatePage"));

export default function Page() {
  return <AnnotatePage />;
}

// SPIKE (spike/local-bundle): under output:"export" a dynamic [id] route
// must enumerate paths at build time. IDs are unknown at build, so we emit
// none — the real fix is converting these to query-param routes (see report).
export function generateStaticParams() {
  // Server (Vercel) build: return [] so the route stays fully dynamic and
  // unknown IDs render on demand exactly as before. Static export build:
  // emit one placeholder so the build completes (output:"export" rejects an
  // empty array). Neither path pre-renders real IDs.
  return process.env.STATIC_EXPORT === "1" ? [{ id: "_placeholder" }] : [];
}
