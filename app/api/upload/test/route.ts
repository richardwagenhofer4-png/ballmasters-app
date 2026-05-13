import { getUploadUrl } from "@/lib/r2";

export async function GET() {
  const url = await getUploadUrl("test.txt");
  return new Response(url, { headers: { "Content-Type": "text/plain" } });
}
