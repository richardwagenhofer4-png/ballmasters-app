import dynamic from "next/dynamic";

const ClipsPage = dynamic(() => import("./ClipsPage"));

export default function Page() {
  return <ClipsPage />;
}
