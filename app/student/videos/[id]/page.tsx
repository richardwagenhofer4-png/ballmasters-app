import dynamic from "next/dynamic";

const StudentVideoPage = dynamic(() => import("./StudentVideoPage"));

export default function Page() {
  return <StudentVideoPage />;
}
