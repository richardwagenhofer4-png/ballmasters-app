import dynamic from "next/dynamic";

const CoachCalendarPage = dynamic(() => import("./CoachCalendarPage"));

export default function Page() {
  return <CoachCalendarPage />;
}
