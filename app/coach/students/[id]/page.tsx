import dynamic from "next/dynamic";

const StudentProfilePage = dynamic(() => import("./StudentProfilePage"));

export default function Page() {
  return <StudentProfilePage />;
}
