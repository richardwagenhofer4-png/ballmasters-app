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

    const { fileName, fileSize } = (await request.json()) as {
      fileName: string;
      fileSize?: number;
    };

    if (!fileName) {
      return Response.json({ error: "fileName is required" }, { status: 400 });
    }
    if (fileSize && fileSize > MAX_BYTES) {
      return Response.json({ error: "File exceeds the 500 MB limit" }, { status: 400 });
    }

    const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `${uid}/${Date.now()}-${safe}`;

    let uploadUrl: string;
    try {
      uploadUrl = await getUploadUrl(key);
    } catch (r2Err: unknown) {
      const msg = r2Err instanceof Error ? r2Err.message : String(r2Err);
      console.error("[api/upload] getUploadUrl failed:", r2Err);
      return Response.json({ error: `Failed to generate upload URL: ${msg}` }, { status: 500 });
    }

    return Response.json({ uploadUrl, key });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/upload]", { message, stack: err instanceof Error ? err.stack : undefined });
    return Response.json({ error: message }, { status: message.startsWith("auth/") ? 401 : 500 });
  }
}
