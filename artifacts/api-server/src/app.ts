import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { apiRateLimit } from "./middleware/rateLimit";
import { securityHeaders, ipRateLimit } from "./middleware/security";

// Build allowed origins list from REPLIT_DOMAINS env var (comma-separated)
const replitDomains = (process.env.REPLIT_DOMAINS ?? "").split(",").map((d) => d.trim()).filter(Boolean);
const replitExpoDomain = (process.env.REPLIT_EXPO_DEV_DOMAIN ?? "").trim();

function buildAllowedOrigins(): (string | RegExp)[] {
  const origins: (string | RegExp)[] = [
    /^https?:\/\/localhost(:\d+)?$/,
    /\.replit\.dev$/,
    /\.replit\.app$/,
    /\.repl\.co$/,
  ];
  replitDomains.forEach((d) => origins.push(`https://${d}`));
  if (replitExpoDomain) origins.push(`https://${replitExpoDomain}`);
  return origins;
}

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Security headers on every response
app.use(securityHeaders);

// IP-based global rate limit (before auth token checks)
app.use(ipRateLimit);

app.use(cors({
  origin: buildAllowedOrigins(),
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-User-Token", "X-Admin-Secret"],
  credentials: false,
}));

// Tighten body size limits — most endpoints need far less than 12mb.
// Photo uploads use base64 strings so we allow up to 9mb (original ~6mb image).
app.use(express.json({ limit: "9mb" }));
app.use(express.urlencoded({ extended: true, limit: "9mb" }));

app.use("/api", apiRateLimit, router);

export default app;
