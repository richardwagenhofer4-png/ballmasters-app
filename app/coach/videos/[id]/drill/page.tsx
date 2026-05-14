import dynamic from "next/dynamic";

const DrillViewPage = dynamic(() => import("./DrillViewPage"));

export default function Page() {
  return <DrillViewPage />;
}
