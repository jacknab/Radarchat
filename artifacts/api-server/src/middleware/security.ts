import type { Request, Response, NextFunction } from "express";

// ---------- Security headers ----------
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'none'; object-src 'none'"
  );
  next();
}

// ---------- IP-based global rate limit ----------
// Protects against unauthenticated abuse before a token is even sent.
const ipBuckets = new Map<string, { count: number; windowStart: number }>();

const IP_WINDOW_MS = 60_000;
const IP_MAX_REQUESTS = 120;

setInterval(() => {
  const now = Date.now();
  for (const [ip, b] of ipBuckets) {
    if (now - b.windowStart > IP_WINDOW_MS) ipBuckets.delete(ip);
  }
}, 60_000);

export function ipRateLimit(req: Request, res: Response, next: NextFunction) {
  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown";

  const now = Date.now();
  if (!ipBuckets.has(ip)) ipBuckets.set(ip, { count: 0, windowStart: now });
  const b = ipBuckets.get(ip)!;

  if (now - b.windowStart > IP_WINDOW_MS) {
    b.count = 0;
    b.windowStart = now;
  }

  b.count++;
  if (b.count > IP_MAX_REQUESTS) {
    res.status(429).json({ error: "Too many requests from this IP. Please slow down." });
    return;
  }
  next();
}

// ---------- Message content validation ----------
const MAX_MESSAGE_LENGTH = 500;
const MAX_URLS_IN_MESSAGE = 0;

// Common spam/phishing URL patterns
const URL_PATTERN = /https?:\/\/|www\.|bit\.ly|t\.co|tinyurl|discord\.gg|telegram\.me|t\.me/i;
// Repeated char spam (e.g. "aaaaaaaaa")
const REPEATED_CHAR_PATTERN = /(.)\1{19,}/;
// Excessive all-caps (>80% caps in messages > 10 chars)

function isSpamContent(text: string): { spam: boolean; reason?: string } {
  if (text.length > MAX_MESSAGE_LENGTH) {
    return { spam: true, reason: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)` };
  }
  if (MAX_URLS_IN_MESSAGE === 0 && URL_PATTERN.test(text)) {
    return { spam: true, reason: "Links are not allowed in messages" };
  }
  if (REPEATED_CHAR_PATTERN.test(text)) {
    return { spam: true, reason: "Message contains excessive repeated characters" };
  }
  // Strip whitespace for length check
  const stripped = text.replace(/\s/g, "");
  if (stripped.length > 10) {
    const upperCount = (stripped.match(/[A-Z]/g) || []).length;
    const ratio = upperCount / stripped.length;
    if (ratio > 0.85) {
      return { spam: true, reason: "Message appears to be all-caps spam" };
    }
  }
  return { spam: false };
}

export function validateMessageContent(text: string): { valid: boolean; error?: string } {
  const trimmed = text.trim();
  if (!trimmed) return { valid: false, error: "Message cannot be empty" };
  const check = isSpamContent(trimmed);
  if (check.spam) return { valid: false, error: check.reason };
  return { valid: true };
}

// ---------- Profile field sanitization ----------
function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/&[a-z#0-9]+;/gi, " ").trim();
}

const PROFILE_LIMITS: Record<string, number> = {
  name: 40,
  age: 10,
  position: 50,
  bodyType: 50,
  endowment: 20,
  hivStatus: 30,
  lookingFor: 50,
  hosting: 50,
  cockSize: 20,
  into: 300,
};

export function sanitizeProfileField(key: string, value: string): string {
  const stripped = stripHtml(value);
  const limit = PROFILE_LIMITS[key] ?? 100;
  return stripped.slice(0, limit);
}

// ---------- Push token validation ----------
export function isValidExpoPushToken(token: unknown): boolean {
  if (typeof token !== "string") return false;
  // ExponentPushToken[...] format
  return /^ExponentPushToken\[[A-Za-z0-9_\-]+\]$/.test(token);
}
