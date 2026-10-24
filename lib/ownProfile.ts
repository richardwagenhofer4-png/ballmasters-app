// Read the signed-in person's own users/{uid} document the safe way
// (Build 1.1 bug 2). Use it wherever a "missing" profile would send the person
// somewhere else or leave them with an empty or wrong view.
//
//  - It does not start while the lastActiveAt write is in flight, and it tells
//    lib/lastActive.ts when it starts and ends, so that write waits for it
//    (lib/lastActive.core.ts explains why).
//  - A read gets about 5 s. If it hasn't answered (the connection died while
//    the phone sat idle), the Firestore connection is reset once and the read
//    is asked again; if that is stuck too, ProfileUnreachableError is thrown.
//    Callers show "Couldn't reach Ball Masters. Try again" for it. It is never
//    "missing".
//  - If the first answer is "missing" it looks once more, from the server,
//    after about a second, and only then believes it (lib/ownProfile.core.ts).
//
// Returns an ordinary DocumentSnapshot, so call sites change by one line.

import {
  disableNetwork, doc, enableNetwork, getDoc, getDocFromServer,
  type DocumentData, type DocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { lastActive } from "@/lib/lastActive";
import { loginTrace } from "@/lib/loginDiagnostics";
import { ReadTimeoutError, readWithMissingRetry } from "@/lib/ownProfile.core";

export { isProfileUnreachable, ProfileUnreachableError } from "@/lib/ownProfile.core";

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ReadTimeoutError(ms)), ms);
    p.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); }
    );
  });
}

// One reset at a time, shared: if two reads get stuck together they don't
// both drop and re-open the connection.
let resetting: Promise<void> | null = null;
function resetNetwork(): Promise<void> {
  resetting ??= (async () => {
    try { await withTimeout(disableNetwork(db), 3000); } catch { /* go on and re-enable */ }
    await withTimeout(enableNetwork(db), 3000);
  })().finally(() => { resetting = null; });
  return resetting;
}

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
        flag: (name, detail, level) => loginTrace.flag(name, detail, uid, level),
        withTimeout,
        resetNetwork,
      },
      onFirstRead
    );
  } finally {
    readDone();
  }
}
