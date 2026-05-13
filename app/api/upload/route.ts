import type { NextRequest } from "next/server";
import { verifyIdToken, getFirestoreDoc } from "@/lib/firebaseServer";
import { putObject } from "@/lib/r2";

export const maxDuration = 300; // 5-minute timeout for large video uploads

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

// POST /api/upload?fileName=safe_name&fileSize=12345
// Authorization: Bearer <token>
// Content-Type: video/mp4
// Body: raw file bytes
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

    const fileName = request.nextUrl.searchParams.get("fileName");
    const fileSize = parseInt(request.nextUrl.searchParams.get("fileSize") ?? "0", 10);
    const contentType = request.headers.get("content-type") || "application/octet-stream";

    if (!fileName) {
      return Response.json({ error: "fileName query param required" }, { status: 400 });
    }
    if (fileSize > MAX_BYTES) {
      return Response.json({ error: "File exceeds the 500 MB limit" }, { status: 400 });
    }
    if (!request.body) {
      return Response.json({ error: "No file body" }, { status: 400 });
    }

    const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `${uid}/${Date.now()}-${safe}`;

    try {
      await putObject(key, contentType, request.body, fileSize || undefined);
    } catch (r2Err: unknown) {
      const msg = r2Err instanceof Error ? r2Err.message : String(r2Err);
      console.error("[api/upload] putObject failed:", r2Err);
      return Response.json({ error: `R2 upload failed: ${msg}` }, { status: 500 });
    }

    return Response.json({ key });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/upload]", { message, stack: err instanceof Error ? err.stack : undefined });
    return Response.json({ error: message }, { status: message.startsWith("auth/") ? 401 : 500 });
  }
}
