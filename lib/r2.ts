import { createHmac, createHash } from "crypto";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Used only for getVideoUrl (GET presigned — no CORS issues)
const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
  forcePathStyle: false,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

const BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME!;

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function sha256hex(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

// Pure Node.js SigV4 presigned PUT URL — matches curl --aws-sigv4 exactly.
// Only the host header is signed so the browser's Content-Type doesn't break the signature.
export function getUploadUrl(key: string): string {
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!;
  const { hostname: endpointHostname } = new URL(process.env.CLOUDFLARE_R2_ENDPOINT!);
  const hostname = `${BUCKET}.${endpointHostname}`;

  const now = new Date();
  const datetime = now.toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z"; // YYYYMMDDTHHMMSSZ
  const date = datetime.slice(0, 8); // YYYYMMDD

  const credentialScope = `${date}/auto/s3/aws4_request`;

  // Build and sort query params — URLSearchParams encodes / as %2F (required by SigV4)
  const queryParams = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKeyId}/${credentialScope}`,
    "X-Amz-Date": datetime,
    "X-Amz-Expires": "3600",
    "X-Amz-SignedHeaders": "host",
  });
  queryParams.sort();
  const canonicalQueryString = queryParams.toString();

  const canonicalRequest = [
    "PUT",
    `/${key}`,
    canonicalQueryString,
    `host:${hostname}\n`, // trailing newline = blank line after headers block
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    datetime,
    credentialScope,
    sha256hex(canonicalRequest),
  ].join("\n");

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${secretAccessKey}`, date), "auto"), "s3"),
    "aws4_request"
  );
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  return `https://${hostname}/${key}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

export async function getVideoUrl(fileName: string): Promise<string> {
  return getSignedUrl(
    r2,
    new GetObjectCommand({ Bucket: BUCKET, Key: fileName }),
    { expiresIn: 60 * 60 * 24 }
  );
}
