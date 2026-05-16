import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { uploadToR2, R2_PUBLIC_URL, r2Enabled } from "../lib/r2";

const router: IRouter = Router();

interface AuthedRequest extends Request {
  userToken?: string;
}

function requireToken(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = (req.header("x-user-token") || "").trim();
  if (!token) {
    res.status(401).json({ error: "Missing X-User-Token header" });
    return;
  }
  req.userToken = token;
  next();
}

const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const THUMB_SIZE = 200;

router.post("/upload", requireToken, async (req: AuthedRequest, res) => {
  if (!r2Enabled) {
    res.status(503).json({ error: "Photo upload is not configured on this server" });
    return;
  }
  const body = (req.body ?? {}) as { data?: unknown; mime?: unknown };
  const data = typeof body.data === "string" ? body.data : "";
  const mime = typeof body.mime === "string" ? body.mime.toLowerCase() : "";
  const ext = ALLOWED_MIME[mime];
  if (!data || !ext) {
    res.status(400).json({
      error: "Provide base64 'data' and supported 'mime' (jpeg/png/webp/gif)",
    });
    return;
  }
  const cleaned = data.includes(",") ? data.split(",", 2)[1]! : data;
  let buf: Buffer;
  try {
    buf = Buffer.from(cleaned, "base64");
  } catch {
    res.status(400).json({ error: "Invalid base64 data" });
    return;
  }
  if (buf.length === 0) {
    res.status(400).json({ error: "Empty image data" });
    return;
  }
  if (buf.length > MAX_UPLOAD_BYTES) {
    res.status(413).json({ error: `Image too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024}MB)` });
    return;
  }

  const id = randomUUID();
  const key = `${id}.${ext}`;
  const thumbKey = `${id}-thumb.jpg`;

  // Generate thumbnail (200×200, cover crop, JPEG)
  let thumbBuf: Buffer;
  try {
    thumbBuf = await sharp(buf)
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: "cover", position: "centre" })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch (err) {
    console.error("Thumbnail generation error:", err);
    res.status(500).json({ error: "Failed to process image" });
    return;
  }

  // Upload original and thumbnail in parallel
  try {
    await Promise.all([
      uploadToR2(key, buf, mime),
      uploadToR2(thumbKey, thumbBuf, "image/jpeg"),
    ]);
  } catch (err) {
    console.error("R2 upload error:", err);
    res.status(500).json({ error: "Failed to upload image" });
    return;
  }

  res.json({
    url: `${R2_PUBLIC_URL}/${key}`,
    thumbnailUrl: `${R2_PUBLIC_URL}/${thumbKey}`,
  });
});

export default router;
