// Server-side Firebase utilities — uses REST APIs, no Admin SDK required

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!;
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY!;
const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// ---------------------------------------------------------------------------
// Token verification
// ---------------------------------------------------------------------------

export async function verifyIdToken(idToken: string): Promise<{ uid: string; email: string }> {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    }
  );
  if (!res.ok) throw new Error("auth/invalid-token");
  const data = await res.json();
  const user = data.users?.[0];
  if (!user) throw new Error("auth/user-not-found");
  return { uid: user.localId, email: user.email ?? "" };
}

// ---------------------------------------------------------------------------
// Firestore value conversion
// ---------------------------------------------------------------------------

type FsValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: null }
  | { timestampValue: string }
  | { arrayValue: { values?: FsValue[] } }
  | { mapValue: { fields: Record<string, FsValue> } };

function fromFsValue(v: FsValue): unknown {
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(fromFsValue);
  if ("mapValue" in v) return fromFields(v.mapValue.fields);
  return null;
}

function fromFields(fields: Record<string, FsValue>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fromFsValue(v)]));
}

function toFsValue(v: unknown): FsValue {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsValue) } };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(v as Record<string, unknown>).map(([k, val]) => [k, toFsValue(val)])
        ),
      },
    };
  }
  return { nullValue: null };
}

function toFields(obj: Record<string, unknown>): Record<string, FsValue> {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, toFsValue(v)]));
}

// ---------------------------------------------------------------------------
// Firestore operations
// ---------------------------------------------------------------------------

export async function getFirestoreDoc(
  collection: string,
  docId: string,
  idToken: string
): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${FIRESTORE}/${collection}/${docId}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) return null;
  const doc = await res.json();
  if (!doc.fields) return null;
  return { id: docId, ...fromFields(doc.fields) };
}

export async function createFirestoreDoc(
  collection: string,
  data: Record<string, unknown>,
  idToken: string
): Promise<string> {
  const res = await fetch(`${FIRESTORE}/${collection}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields: toFields(data) }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message ?? "Firestore write failed");
  }
  const doc = await res.json();
  return (doc.name as string).split("/").pop()!;
}

type Filter = { field: string; op: string; value: unknown };

export async function queryFirestore(
  collection: string,
  filters: Filter[],
  idToken: string
): Promise<Array<Record<string, unknown>>> {
  const where =
    filters.length === 1
      ? {
          fieldFilter: {
            field: { fieldPath: filters[0].field },
            op: filters[0].op,
            value: toFsValue(filters[0].value),
          },
        }
      : {
          compositeFilter: {
            op: "AND",
            filters: filters.map((f) => ({
              fieldFilter: {
                field: { fieldPath: f.field },
                op: f.op,
                value: toFsValue(f.value),
              },
            })),
          },
        };

  const res = await fetch(`${FIRESTORE}:runQuery`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collection }],
        where,
        orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }],
      },
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message ?? "Firestore query failed");
  }
  const results: Array<{ document?: { name: string; fields: Record<string, FsValue> } }> =
    await res.json();
  return results
    .filter((r) => r.document?.fields)
    .map((r) => {
      const id = r.document!.name.split("/").pop()!;
      return { id, ...fromFields(r.document!.fields) };
    });
}
