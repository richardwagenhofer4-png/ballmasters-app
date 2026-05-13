import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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

export async function putObject(
  key: string,
  contentType: string,
  body: ReadableStream<Uint8Array> | Buffer | Uint8Array,
  contentLength?: number
): Promise<void> {
  await r2.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
      Body: body as never, // SDK accepts ReadableStream in Node 18+
      ...(contentLength !== undefined && { ContentLength: contentLength }),
    })
  );
}

export async function getVideoUrl(fileName: string): Promise<string> {
  return getSignedUrl(
    r2,
    new GetObjectCommand({ Bucket: BUCKET, Key: fileName }),
    { expiresIn: 60 * 60 * 24 }
  );
}
