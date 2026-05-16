# Radarchat — Radar

A location-based chat and social discovery app for meeting nearby people. Users go live on a radar map, browse nearby profiles, chat privately, and interact via photo unlocks and hot-stuff reactions.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/profile-radar run dev` — run the Expo mobile app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (auto-provisioned)
- Optional env: `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` — Cloudflare R2 for photo storage
- Optional env: `ADMIN_SECRET` — secret header value to access `/api/admin/*` routes
- Optional env: `SESSION_SECRET` — session signing key

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Mobile: Expo 54 / React Native 0.81 / Expo Router
- API: Express 5 + WebSocket (ws)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- Build: esbuild (CJS bundle)
- Image processing: sharp (thumbnail generation)
- Photo storage: Cloudflare R2 (optional, gracefully disabled if not configured)

## Where things live

- `artifacts/api-server/src/routes/profile.ts` — all API routes (profiles, messages, nearby, blocks, hot-stuff, notifications)
- `artifacts/api-server/src/routes/admin.ts` — shadow-ban and user-list admin endpoints
- `artifacts/api-server/src/routes/upload.ts` — photo upload to R2
- `artifacts/api-server/src/middleware/rateLimit.ts` — per-user token rate limiters
- `artifacts/api-server/src/middleware/security.ts` — IP rate limit, security headers, message validation, profile sanitization, push token validation
- `artifacts/api-server/src/lib/ws.ts` — WebSocket server (real-time messages + notifications)
- `artifacts/api-server/src/lib/push.ts` — Expo push notification delivery
- `artifacts/api-server/src/lib/r2.ts` — Cloudflare R2 photo storage
- `artifacts/api-server/src/lib/gpsJump.ts` — GPS velocity anomaly detection
- `artifacts/api-server/src/lib/seeder.ts` — demo profile seeder
- `lib/db/src/schema/index.ts` — DB schema (Drizzle)
- `artifacts/profile-radar/contexts/AppContext.tsx` — single global state context
- `artifacts/profile-radar/lib/api.ts` — typed API client helper

## Architecture decisions

- **Token-based identity**: Users are identified by a UUID stored in AsyncStorage, generated on first launch. No password/email auth. Simple enough for a hookup/social app but note tokens are not cryptographically verified against a secret — only existence in DB is checked.
- **Shadow banning**: Banned users can still interact normally from their perspective but are hidden from other users' feeds. Messages from banned users are silently discarded.
- **GPS anomaly detection**: Server-side velocity check prevents location spoofing (users who jump > reasonable speed are rate-limited).
- **WebSocket real-time**: Messages, notifications, and unlock approvals are delivered over persistent WS connections. Poll-based fallback every 4s for messages and 15s for nearby.
- **R2 photo storage is optional**: If R2 env vars are not set, photo uploads return 503 but the rest of the app works.

## Product

- Users create a profile with photos, bio, and location
- Live radar map shows nearby users within a configurable radius
- Private 1:1 messaging between nearby users
- Photo locking/unlocking system (request and grant access to private photos)
- Hot-stuff (like) system with push notification to recipient
- Block system, conversation archiving
- Shadow-ban admin tools via `POST /api/admin/shadow-ban/:userId`

## Security hardening applied (2025-05-16)

1. **IP-based global rate limit** (120 req/min per IP) — blocks unauthenticated abuse before token checks
2. **Security headers** — X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, CSP on every response
3. **CORS lockdown** — restricted to `*.replit.dev`, `*.replit.app`, `*.repl.co`, and localhost. Was previously wide-open.
4. **Message-specific rate limit** — max 10 messages/minute per user token (separate from the 20 req/min general limit)
5. **Message content validation** — max 500 chars, no URLs/links (anti-spam), no excessive repeated chars, no all-caps spam
6. **Profile field sanitization** — all profile fields are HTML-stripped and length-capped (name 40, bio 300, etc.)
7. **Push token format validation** — only valid `ExponentPushToken[...]` format accepted for storage and delivery; prevents injection
8. **Shadow-ban message silencing** — banned users get a fake success response but messages are never stored or delivered
9. **Must have a profile to message** — users cannot send messages until they have created a profile with a name
10. **Self-message blocked** — cannot send messages to yourself
11. **WS token length validation** — WebSocket connections with tokens < 8 or > 128 chars are immediately rejected
12. **Body size tightened** — 9mb limit (from 12mb) with explicit justification for photo uploads
13. **Push notification only to validated tokens** — secondary check in message delivery path

## Gotchas

- The seeder creates 20 demo profiles on first boot. This is intentional.
- R2 photo upload needs all 5 R2 env vars set. If any are missing, uploads are disabled (503) but the app still works.
- `ADMIN_SECRET` must be set before admin routes become accessible. If not set, all admin routes return 503.
- The `minimumReleaseAge: 1440` in pnpm-workspace.yaml enforces a 1-day package release age check for supply-chain attack defense — do not remove it.
- sharp is in `onlyBuiltDependencies` so it can run its native build scripts.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
