import dynamic from "next/dynamic";

const AnnotatePage = dynamic(() => import("./AnnotatePage"));

export default function Page() {
  return <AnnotatePage />;
}
