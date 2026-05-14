import dynamic from "next/dynamic";

const InviteCoachPage = dynamic(() => import("./InviteCoachPage"));

export default function Page() {
  return <InviteCoachPage />;
}
