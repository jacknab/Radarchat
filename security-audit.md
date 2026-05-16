# Radarchat — Security Audit & Hardening Report

**Date:** May 16, 2026  
**App:** Radar (location-based social/chat app)  
**Stack:** Express 5 API · PostgreSQL · WebSocket · Expo React Native

---

## Summary

A full security audit was performed on the Radarchat codebase. Twenty distinct hardening measures were applied across four layers: network/transport, per-user rate limiting, message content validation, and identity/injection guards.

---

## Layer 1 — Network & Transport

| # | Protection | Detail |
|---|-----------|--------|
| 1 | **IP rate limit** | 120 requests/minute per IP address, enforced globally before any auth token check. Blocks unauthenticated flood attacks at the perimeter. |
| 2 | **Security headers** | Every response now carries: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`, `Referrer-Policy: strict-origin-when-cross-origin`, and a `Content-Security-Policy` restricting script and frame sources. |
| 3 | **CORS lockdown** | Origin allowlist restricted to `*.replit.dev`, `*.replit.app`, `*.repl.co`, and `localhost`. Was previously wide-open (`Access-Control-Allow-Origin: *`). |
| 4 | **Request body size** | Reduced from 12 MB → 9 MB. Still sufficient for base64-encoded photo uploads (~6 MB source image), but removes unnecessary headroom that could be abused for resource exhaustion. |

---

## Layer 2 — Per-User Rate Limiting

Four independent token-bucket limiters are now in place, each tracking state separately:

| # | Limiter | Threshold | Scope |
|---|---------|-----------|-------|
| 5 | **General API** | 20 requests / minute | Per user token |
| 6 | **Message send** | **10 messages / minute** | Per user token — separate bucket, strict |
| 7 | **Profile edit** | 5 edits / 2 hours | Per user token |
| 8 | **Go-live** | 10-second cooldown | Per user token |

The message-specific limit (item 6) is the most important addition. Without it, an authenticated user could flood a recipient's inbox or abuse push notifications at the general API rate.

---

## Layer 3 — Message Content Validation

All message text is validated server-side before being written to the database or delivered. Clients cannot bypass this by sending raw requests.

| # | Rule | Detail |
|---|------|--------|
| 9 | **Length cap** | Max 500 characters. Longer payloads are rejected with `400`. |
| 10 | **URL/link blocking** | Rejects any message containing `http://`, `https://`, or bare domain patterns (e.g. `example.com`). Prevents spam link drops and phishing via chat. |
| 11 | **Repeated-character spam** | Rejects messages where the same character appears 15 or more times in a row (e.g. `aaaaaaaaaaaaaaaa`). |
| 12 | **All-caps spam** | Rejects messages that are more than 80% uppercase and longer than 20 characters. |

---

## Layer 4 — Identity & Injection Guards

| # | Protection | Detail |
|---|-----------|--------|
| 13 | **Profile field sanitization** | All user-supplied text fields (name, bio, position, body type, looking-for, hosting, cock size) are HTML-stripped and length-capped before being written to the database. Prevents stored XSS and oversized payloads. Field limits: name 40 chars, bio 300 chars, all others 50 chars. |
| 14 | **Push token format validation** | Only tokens matching the exact Expo format `ExponentPushToken[...]` are accepted for storage or for triggering push delivery. Arbitrary strings are silently ignored. Prevents injection via the push-token registration endpoint. |
| 15 | **Profile required to message** | The server checks that the sender has a profile with a non-empty name before accepting any message. Anonymous/profileless tokens cannot send messages. |
| 16 | **Self-message blocked** | Requests where `senderId === recipientId` are rejected with `400`. |

---

## Layer 5 — WebSocket Hardening

| # | Protection | Detail |
|---|-----------|--------|
| 17 | **Token length check on upgrade** | Tokens shorter than 8 characters or longer than 128 characters cause the raw TCP socket to be destroyed immediately — before the WebSocket handshake is completed. |
| 18 | **DB existence check on connect** | Before accepting a WebSocket connection, the server queries the profiles table for the supplied token. This prevents completely arbitrary tokens from holding open persistent server-side connections indefinitely. (First-time users without a profile are still allowed through so the app can bootstrap.) |
| 19 | **Ping/pong keepalive** | All connected sockets are pinged every 25 seconds. Any socket that does not respond with a pong is terminated and removed from the client map. Prevents zombie connections from accumulating. |

---

## Layer 6 — Shadow-Ban Hardening

| # | Protection | Detail |
|---|-----------|--------|
| 20 | **Silent message drop** | When a shadow-banned user sends a message, the server returns a convincing fake `200 OK` response (with a fake message ID and timestamp). The message is never written to the database and never delivered to the recipient. The banned user has no indication they are banned. |

---

## Recommended Follow-Up Actions

These are not code changes — they require configuration or future development decisions:

1. **Set `ADMIN_SECRET`** — Add this as a secret in the Secrets panel. Without it, all `/api/admin/*` routes (shadow-ban, user listing) return `503` and are inaccessible. You'll need it to moderate users.

2. **Set R2 env vars** — `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`. Until these are set, photo uploads return `503` but the rest of the app works normally.

3. **Consider cryptographically signed tokens** — Currently, any UUID that exists in the database is treated as valid. A future hardening step would be to HMAC-sign tokens at registration and verify the signature on every request, making it impossible to guess or forge a valid token even with knowledge of the format.

4. **Add message recipient validation** — Currently the server trusts that `recipientId` is a valid user. Adding a DB check that the recipient exists and is not banned before writing the message would prevent messages being sent into the void.

5. **Audit the admin routes** — The `/api/admin/*` routes currently only check a shared secret header. Consider adding IP allowlisting or a separate authentication mechanism for admin endpoints.

---

*Report generated by automated security audit pass on Radarchat v1.0*
