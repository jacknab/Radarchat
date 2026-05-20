import type { Request, Response, NextFunction } from "express";

interface TokenBucket {
  reqCount: number;
  reqWindowStart: number;
  editCount: number;
  editWindowStart: number;
  lastGoLive: number;
  msgCount: number;
  msgWindowStart: number;
}

const buckets = new Map<string, TokenBucket>();

function getBucket(token: string): TokenBucket {
  if (!buckets.has(token)) {
    buckets.set(token, {
      reqCount: 0,
      reqWindowStart: Date.now(),
      editCount: 0,
      editWindowStart: Date.now(),
      lastGoLive: 0,
      msgCount: 0,
      msgWindowStart: Date.now(),
    });
  }
  return buckets.get(token)!;
}

setInterval(() => {
  const now = Date.now();
  for (const [token, b] of buckets) {
    const reqStale = now - b.reqWindowStart > 5 * 60_000;
    const editStale = now - b.editWindowStart > 2 * 3600_000;
    const goLiveStale = now - b.lastGoLive > 60_000;
    const msgStale = now - b.msgWindowStart > 5 * 60_000;
    if (reqStale && editStale && goLiveStale && msgStale) buckets.delete(token);
  }
}, 5 * 60_000);

export function apiRateLimit(req: Request, res: Response, next: NextFunction) {
  const token = (req.header("x-user-token") || "").trim();
  if (!token) return next();

  const bucket = getBucket(token);
  const now = Date.now();

  if (now - bucket.reqWindowStart > 60_000) {
    bucket.reqCount = 0;
    bucket.reqWindowStart = now;
  }

  bucket.reqCount++;
  if (bucket.reqCount > 120) {
    res.status(429).json({ error: "Too many requests. Please slow down." });
    return;
  }

  next();
}

export function profileEditRateLimit(req: Request, res: Response, next: NextFunction) {
  const token = (req.header("x-user-token") || "").trim();
  if (!token) return next();

  const bucket = getBucket(token);
  const now = Date.now();

  if (now - bucket.editWindowStart > 3600_000) {
    bucket.editCount = 0;
    bucket.editWindowStart = now;
  }

  bucket.editCount++;
  if (bucket.editCount > 5) {
    res.status(429).json({ error: "Profile edit limit reached. You can edit up to 5 times per hour." });
    return;
  }

  next();
}

export function goLiveRateLimit(req: Request, res: Response, next: NextFunction) {
  const token = (req.header("x-user-token") || "").trim();
  if (!token) return next();

  const bucket = getBucket(token);
  const now = Date.now();

  if (now - bucket.lastGoLive < 10_000) {
    res.status(429).json({ error: "Please wait a moment before going live again." });
    return;
  }

  bucket.lastGoLive = now;
  next();
}

// Strict per-user message rate limit: max 10 messages per minute
// This prevents spam floods even from authenticated users.
export function messageRateLimit(req: Request, res: Response, next: NextFunction) {
  const token = (req.header("x-user-token") || "").trim();
  if (!token) return next();

  const bucket = getBucket(token);
  const now = Date.now();

  if (now - bucket.msgWindowStart > 60_000) {
    bucket.msgCount = 0;
    bucket.msgWindowStart = now;
  }

  bucket.msgCount++;
  if (bucket.msgCount > 10) {
    res.status(429).json({ error: "Message limit reached. Max 10 messages per minute." });
    return;
  }

  next();
}
