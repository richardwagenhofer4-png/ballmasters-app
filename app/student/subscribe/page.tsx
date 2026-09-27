import Paywall from "@/components/Paywall";

// /student/subscribe            — choose a plan (where the gate sends athletes with none)
// /student/subscribe?mode=upgrade — Access → Coached only
export default async function SubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { mode } = await searchParams;
  return <Paywall mode={mode === "upgrade" ? "upgrade" : "subscribe"} />;
}
