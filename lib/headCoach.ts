import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export async function getHeadCoachId(): Promise<string | null> {
  const snap = await getDoc(doc(db, "settings", "general"));
  if (!snap.exists()) return null;
  return (snap.data().headCoachId as string | undefined) ?? null;
}
