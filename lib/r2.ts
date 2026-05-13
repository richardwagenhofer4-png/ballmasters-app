import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";

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

export type PresignedPost = { url: string; fields: Record<string, string> };

export async function getUploadUrl(fileName: string, fileType: string): Promise<PresignedPost> {
  return createPresignedPost(r2, {
    Bucket: BUCKET,
    Key: fileName,
    Fields: { "Content-Type": fileType },
    Expires: 3600,
    Conditions: [["content-length-range", 1, 500 * 1024 * 1024]],
  });
}

export async function getVideoUrl(fileName: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: fileName,
  });
  return getSignedUrl(r2, command, { expiresIn: 60 * 60 * 24 });
}
