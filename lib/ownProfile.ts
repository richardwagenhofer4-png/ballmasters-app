// Read the signed-in person's own users/{uid} document the safe way
// (Build 1.1 bug 2). Use it wherever a "missing" profile would send the person
// somewhere else or leave them with an empty or wrong view.
//
//  - It does not start while the lastActiveAt write is in flight, and it tells
//    lib/lastActive.ts when it starts and ends, so that write waits for it
//    (lib/lastActive.core.ts explains why).
//  - If the first answer is "missing" it looks once more, from the server,
//    after about a second, and only then believes it (lib/ownProfile.core.ts).
//
// Returns an ordinary DocumentSnapshot, so call sites change by one line.

import { doc, getDoc, getDocFromServer, type DocumentData, type DocumentSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { lastActive } from "@/lib/lastActive";
import { loginTrace } from "@/lib/loginDiagnostics";
import { readWithMissingRetry } from "@/lib/ownProfile.core";

export async function readOwnUserDoc(
  uid: string,
  onFirstRead?: (meta: { exists: boolean; fromCache: boolean }) => void
): Promise<DocumentSnapshot<DocumentData>> {
  await lastActive.beforeRead(uid);
  const readDone = lastActive.readStarted(uid);
  try {
    const ref = doc(db, "users", uid);
    return await readWithMissingRetry<DocumentSnapshot<DocumentData>>(
      {
        first: () => getDoc(ref),
        fromServer: () => getDocFromServer(ref),
        sleep: ms => new Promise<void>(resolve => setTimeout(resolve, ms)),
        trace: (step, detail, level) => loginTrace.step(step, detail, level),
        fail: (step, err, detail) => loginTrace.fail(step, err, detail),
        flag: (name, detail) => loginTrace.flag(name, detail, uid),
      },
      onFirstRead
    );
  } finally {
    readDone();
  }
}
