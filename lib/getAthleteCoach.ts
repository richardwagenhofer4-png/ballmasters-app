import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getHeadCoachId } from "@/lib/headCoach";

export async function getAthleteCoachId(athleteUid: string): Promise<string | null> {
  const userSnap = await getDoc(doc(db, "users", athleteUid));
  if (userSnap.exists()) {
    const coachId = userSnap.data().coachId as string | undefined;
    if (coachId) return coachId;
  }
  try {
    return await getHeadCoachId();
  } catch {
    return null;
  }
}
