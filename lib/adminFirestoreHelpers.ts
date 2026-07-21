import type { QuerySnapshot } from "firebase-admin/firestore";

// Deletes every document in a query snapshot in parallel. Shared between the
// video teardown route and account deletion — both bulk-delete matched
// Firestore docs (subcollections, notifications, bookings, ...) the same way.
export async function deleteAllDocs(snap: QuerySnapshot): Promise<void> {
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}
