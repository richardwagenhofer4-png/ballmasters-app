import type { NextRequest } from "next/server";
import { verifyIdToken, getFirestoreDoc } from "@/lib/firebaseServer";
import { getUploadUrl } from "@/lib/r2";

const MAX_BYTES = 500 * 1024 * 1024; // 500 MB

const REQUIRED_R2_VARS = [
  "CLOUDFLARE_R2_ENDPOINT",
  "CLOUDFLARE_R2_ACCESS_KEY_ID",
  "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
  "CLOUDFLARE_R2_BUCKET_NAME",
] as const;

// GET /api/upload — env var health check (safe: no values exposed)
export async function GET() {
  const status = Object.fromEntries(
    REQUIRED_R2_VARS.map((key) => [key, !!process.env[key]])
  );
  const allPresent = Object.values(status).every(Boolean);
  return Response.json(
    { ok: allPresent, vars: status },
    { status: allPresent ? 200 : 500 }
  );
}

export async function POST(request: NextRequest) {
  // Check R2 env vars before doing anything else
  const missingVars = REQUIRED_R2_VARS.filter((key) => !process.env[key]);
  if (missingVars.length > 0) {
    console.error("[api/upload] Missing R2 env vars:", missingVars);
    return Response.json(
      { error: `Server misconfiguration: missing env vars: ${missingVars.join(", ")}` },
      { status: 500 }
    );
  }

  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const idToken = authHeader.slice(7);

    const { uid } = await verifyIdToken(idToken);
    const profile = await getFirestoreDoc("users", uid, idToken);

    if (profile?.role !== "coach") {
      return Response.json({ error: "Only coaches can upload videos" }, { status: 403 });
    }

    const body = await request.json();
    const { fileName, fileType, fileSize } = body as {
      fileName: string;
      fileType: string;
      fileSize?: number;
    };

    if (!fileName || !fileType) {
      return Response.json({ error: "fileName and fileType are required" }, { status: 400 });
    }
    if (fileSize && fileSize > MAX_BYTES) {
      return Response.json({ error: "File exceeds the 500 MB limit" }, { status: 400 });
    }

    // Sanitise filename and namespace by coach uid + timestamp
    const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `${uid}/${Date.now()}-${safe}`;

    let uploadUrl: string;
    try {
      uploadUrl = await getUploadUrl(key, fileType);
    } catch (r2Err: unknown) {
      const msg = r2Err instanceof Error ? r2Err.message : String(r2Err);
      console.error("[api/upload] getUploadUrl failed:", r2Err);
      return Response.json(
        { error: `Failed to generate upload URL: ${msg}` },
        { status: 500 }
      );
    }

    return Response.json({ uploadUrl, key });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[api/upload]", { message, stack });
    const status = message.startsWith("auth/") ? 401 : 500;
    return Response.json({ error: message }, { status });
  }
}
