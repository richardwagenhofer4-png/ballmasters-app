import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

export async function getAthleteCoachId(athleteUid: string): Promise<string | null> {
  // 1. From user doc
  const userSnap = await getDoc(doc(db, "users", athleteUid));
  if (userSnap.exists()) {
    const coachId = userSnap.data().coachId as string | undefined;
    if (coachId) return coachId;
  }
  // 2. From most recent video with this athlete in studentIds
  const vidSnap = await getDocs(
    query(
      collection(db, "videos"),
      where("studentIds", "array-contains", athleteUid),
      orderBy("createdAt", "desc"),
      limit(1)
    )
  );
  if (!vidSnap.empty) {
    const coachId = vidSnap.docs[0].data().coachId as string | undefined;
    if (coachId) return coachId;
  }
  // 3. First coach or admin user
  const coachSnap = await getDocs(
    query(collection(db, "users"), where("role", "in", ["coach", "admin"]), limit(1))
  );
  if (!coachSnap.empty) return coachSnap.docs[0].id;
  return null;
}
