import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";

const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
export const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME ?? "";
export const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");

export const r2Enabled =
  !!R2_ENDPOINT && !!R2_ACCESS_KEY_ID && !!R2_SECRET_ACCESS_KEY && !!R2_BUCKET_NAME && !!R2_PUBLIC_URL;

if (!r2Enabled) {
  console.warn(
    "[r2] Cloudflare R2 env vars not set — photo upload/delete disabled. " +
      "Set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL to enable.",
  );
}

export const s3 = r2Enabled
  ? new S3Client({
      region: "auto",
      endpoint: R2_ENDPOINT!,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID!,
        secretAccessKey: R2_SECRET_ACCESS_KEY!,
      },
    })
  : null;

export async function uploadToR2(key: string, body: Buffer, contentType: string): Promise<void> {
  if (!s3 || !r2Enabled) throw new Error("R2 is not configured");
  await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key, Body: body, ContentType: contentType }));
}

export function r2KeyFromUrl(url: string): string | null {
  if (!R2_PUBLIC_URL) return null;
  const prefix = R2_PUBLIC_URL + "/";
  if (!url.startsWith(prefix)) return null;
  return url.slice(prefix.length);
}

export async function deleteR2Keys(keys: string[]): Promise<void> {
  if (!s3 || !r2Enabled || keys.length === 0) return;
  if (keys.length === 1) {
    await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: keys[0]! }));
  } else {
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: R2_BUCKET_NAME,
        Delete: { Objects: keys.map((k) => ({ Key: k })), Quiet: true },
      }),
    );
  }
}

export function photoUrisToR2Keys(uris: string[]): string[] {
  return uris.flatMap((uri) => {
    const key = r2KeyFromUrl(uri);
    return key ? [key] : [];
  });
}
