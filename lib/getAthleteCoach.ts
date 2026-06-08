import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export async function getAthleteCoachId(athleteUid: string): Promise<string | null> {
  const userSnap = await getDoc(doc(db, "users", athleteUid));
  if (!userSnap.exists()) return null;
  const coachId = userSnap.data().coachId as string | undefined;
  return coachId ?? null;
}
