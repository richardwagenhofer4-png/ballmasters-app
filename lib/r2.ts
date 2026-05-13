import { SignatureV4 } from "@smithy/signature-v4";
import { HttpRequest } from "@smithy/protocol-http";
import { Hash } from "@smithy/hash-node";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Used only for getVideoUrl (GET presigned — no CORS issues)
const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

const BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME!;

// Manually build a SigV4 presigned PUT URL that signs ONLY the host header.
// The AWS SDK always injects extra headers (Content-Type, checksum) into signed
// headers; using @smithy/signature-v4 directly gives us exact control.
export async function getUploadUrl(key: string): Promise<string> {
  const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT!;
  const { hostname } = new URL(endpoint);

  const signer = new SignatureV4({
    credentials: {
      accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
    },
    region: "auto",
    service: "s3",
    // Hash.bind(null, "sha256") satisfies HashConstructor: new(secret?) => HashInterface
    sha256: Hash.bind(null, "sha256"),
  });

  const request = new HttpRequest({
    method: "PUT",
    protocol: "https:",
    hostname,
    path: `/${BUCKET}/${key}`,
    headers: { host: hostname }, // only header — so SignedHeaders=host
  });

  const presigned = await signer.presign(request, { expiresIn: 3600 });

  // Convert the signed HttpRequest back to a URL string
  const params = new URLSearchParams(
    Object.entries(presigned.query ?? {}).flatMap(([k, v]) =>
      Array.isArray(v) ? v.map((val) => [k, val] as [string, string]) : [[k, v as string]]
    )
  );
  return `https://${presigned.hostname}${presigned.path}?${params.toString()}`;
}

export async function getVideoUrl(fileName: string): Promise<string> {
  return getSignedUrl(
    r2,
    new GetObjectCommand({ Bucket: BUCKET, Key: fileName }),
    { expiresIn: 60 * 60 * 24 }
  );
}
