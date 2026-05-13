import { createHmac, createHash } from "crypto";

const ACCESS_KEY_ID = "dd62c26914cd870038443428699d92d5";
const SECRET_ACCESS_KEY = "3afe7df0ce78720966b39658f02a7b288a5115720253ac6b8fdd075f873287cc";
const ENDPOINT = "https://fefb9e09f22db5041a9879f152d37034.r2.cloudflarestorage.com";
const BUCKET = "ballmasters-videos";
const KEY = "test.txt";

function hmac(key, data) {
  return createHmac("sha256", key).update(data).digest();
}

function sha256hex(data) {
  return createHash("sha256").update(data).digest("hex");
}

const { hostname: endpointHostname } = new URL(ENDPOINT);
const hostname = `${BUCKET}.${endpointHostname}`;

const now = new Date();
const datetime = now.toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";
const date = datetime.slice(0, 8);

const credentialScope = `${date}/auto/s3/aws4_request`;

const queryParams = new URLSearchParams({
  "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
  "X-Amz-Credential": `${ACCESS_KEY_ID}/${credentialScope}`,
  "X-Amz-Date": datetime,
  "X-Amz-Expires": "3600",
  "X-Amz-SignedHeaders": "host",
});
queryParams.sort();
const canonicalQueryString = queryParams.toString();

const canonicalRequest = [
  "PUT",
  `/${KEY}`,
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
  hmac(hmac(hmac(`AWS4${SECRET_ACCESS_KEY}`, date), "auto"), "s3"),
  "aws4_request"
);
const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

const url = `https://${hostname}/${KEY}?${canonicalQueryString}&X-Amz-Signature=${signature}`;

console.log("Presigned URL:");
console.log(url);
console.log();
console.log("Canonical Request:");
console.log(canonicalRequest);
console.log();

console.log("Uploading 'hello world' via PUT...");
const res = await fetch(url, { method: "PUT", body: "hello world" });

console.log("Status:", res.status, res.statusText);
const body = await res.text();
console.log("Body:", body || "(empty)");
