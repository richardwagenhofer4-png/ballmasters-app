import { createHmac, createHash } from "crypto";

const BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME!;

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function sha256hex(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

function presignedUrl(method: "PUT" | "GET", key: string, expiresIn: number): string {
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!;
  const { hostname: endpointHostname } = new URL(process.env.CLOUDFLARE_R2_ENDPOINT!);
  const hostname = `${BUCKET}.${endpointHostname}`;

  const now = new Date();
  const datetime = now.toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";
  const date = datetime.slice(0, 8);

  const credentialScope = `${date}/auto/s3/aws4_request`;

  const queryParams = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKeyId}/${credentialScope}`,
    "X-Amz-Date": datetime,
    "X-Amz-Expires": String(expiresIn),
    "X-Amz-SignedHeaders": "host",
  });
  queryParams.sort();
  const canonicalQueryString = queryParams.toString();

  const canonicalRequest = [
    method,
    `/${key}`,
    canonicalQueryString,
    `host:${hostname}\n`,
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

export function getUploadUrl(key: string): string {
  return presignedUrl("PUT", key, 3600);
}

export function getVideoUrl(fileName: string): string {
  return presignedUrl("GET", fileName, 60 * 60 * 24);
}
