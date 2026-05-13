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

export async function getUploadUrl(fileName: string, fileType: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: fileName,
    ContentType: fileType,
  });
  return getSignedUrl(r2, command, { expiresIn: 3600 });
}

export async function getVideoUrl(fileName: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: fileName,
  });
  return getSignedUrl(r2, command, { expiresIn: 60 * 60 * 24 });
}
