import dynamic from "next/dynamic";

const StudentCalendarPage = dynamic(() => import("./StudentCalendarPage"));

export default function Page() {
  return <StudentCalendarPage />;
}
