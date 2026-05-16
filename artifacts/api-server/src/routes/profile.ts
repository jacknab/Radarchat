import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  profiles,
  messages,
  blocks,
  hotStuff,
  archived,
  photoUnlocks,
  photoUnlockRequests,
  notifications,
} from "@workspace/db/schema";
import { randomUUID } from "node:crypto";
import { sendToUser, isUserConnected } from "../lib/ws";
import { sendExpoPush } from "../lib/push";
import { deleteR2Keys, photoUrisToR2Keys } from "../lib/r2";
import { checkGpsJump, clearGpsHistory } from "../lib/gpsJump";
import { profileEditRateLimit, goLiveRateLimit, messageRateLimit } from "../middleware/rateLimit";
import { validateMessageContent, sanitizeProfileField, sanitizeIntoTags, isValidExpoPushToken } from "../middleware/security";

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

function distanceMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

// ---------- Profile ----------
router.put("/profile", requireToken, profileEditRateLimit, async (req: AuthedRequest, res) => {
  const token = req.userToken!;
  const now = Date.now();
  const body = req.body ?? {};
  const newPhotos: { id: string; uri: string; isLocked: boolean }[] = Array.isArray(body.photos) ? body.photos : [];
  const incoming = {
    id: token,
    name: sanitizeProfileField("name", typeof body.name === "string" ? body.name : ""),
    age: sanitizeProfileField("age", typeof body.age === "string" ? body.age : ""),
    position: sanitizeProfileField("position", typeof body.position === "string" ? body.position : ""),
    bodyType: sanitizeProfileField("bodyType", typeof body.bodyType === "string" ? body.bodyType : ""),
    endowment: sanitizeProfileField("endowment", typeof body.endowment === "string" ? body.endowment : ""),
    lookingFor: sanitizeProfileField("lookingFor", typeof body.lookingFor === "string" ? body.lookingFor : ""),
    hosting: sanitizeProfileField("hosting", typeof body.hosting === "string" ? body.hosting : ""),
    cockSize: typeof body.cockSize === "string" ? sanitizeProfileField("cockSize", body.cockSize) : null,
    into: sanitizeIntoTags(typeof body.into === "string" ? body.into : ""),
    photos: newPhotos,
    isOnline: true,
    isLive: true,
    lastSeen: now,
    latitude: typeof body.latitude === "number" ? body.latitude : null,
    longitude: typeof body.longitude === "number" ? body.longitude : null,
    createdAt: now,
  };

  const [existing] = await db.select({ photos: profiles.photos }).from(profiles).where(eq(profiles.id, token)).limit(1);
  const oldPhotos = Array.isArray(existing?.photos)
    ? (existing.photos as { uri: string; thumbnailUri?: string }[])
    : [];
  const newUriSet = new Set(newPhotos.map((p) => p.uri));
  const removedPhotos = oldPhotos.filter((p) => !newUriSet.has(p.uri));
  const removedUris = removedPhotos.flatMap((p) =>
    [p.uri, ...(p.thumbnailUri ? [p.thumbnailUri] : [])]
  );

  const [row] = await db
    .insert(profiles)
    .values(incoming)
    .onConflictDoUpdate({
      target: profiles.id,
      set: {
        name: incoming.name,
        age: incoming.age,
        position: incoming.position,
        bodyType: incoming.bodyType,
        endowment: incoming.endowment,
        lookingFor: incoming.lookingFor,
        hosting: incoming.hosting,
        cockSize: incoming.cockSize,
        into: incoming.into,
        photos: incoming.photos,
        isOnline: true,
        isLive: true,
        lastSeen: now,
        latitude: incoming.latitude,
        longitude: incoming.longitude,
      },
    })
    .returning();
  res.json(row);

  const removedKeys = photoUrisToR2Keys(removedUris);
  if (removedKeys.length > 0) {
    deleteR2Keys(removedKeys).catch((err) =>
      console.error("R2 photo cleanup error:", err),
    );
  }
});

router.delete("/profile", requireToken, async (req: AuthedRequest, res) => {
  const me = req.userToken!;

  const [existing] = await db.select({ photos: profiles.photos }).from(profiles).where(eq(profiles.id, me)).limit(1);
  const allUris: string[] = Array.isArray(existing?.photos)
    ? (existing.photos as { uri: string; thumbnailUri?: string }[]).flatMap((p) =>
        [p.uri, ...(p.thumbnailUri ? [p.thumbnailUri] : [])]
      )
    : [];

  await db.delete(messages).where(or(eq(messages.senderId, me), eq(messages.recipientId, me)));
  await db.delete(blocks).where(or(eq(blocks.blockerId, me), eq(blocks.blockedId, me)));
  await db.delete(hotStuff).where(or(eq(hotStuff.ownerId, me), eq(hotStuff.targetId, me)));
  await db.delete(archived).where(or(eq(archived.ownerId, me), eq(archived.targetId, me)));
  await db
    .delete(photoUnlocks)
    .where(or(eq(photoUnlocks.granterId, me), eq(photoUnlocks.granteeId, me)));
  await db
    .delete(photoUnlockRequests)
    .where(or(eq(photoUnlockRequests.requesterId, me), eq(photoUnlockRequests.targetId, me)));
  await db.delete(profiles).where(eq(profiles.id, me));
  clearGpsHistory(me);
  res.json({ ok: true });

  const keys = photoUrisToR2Keys(allUris);
  if (keys.length > 0) {
    deleteR2Keys(keys).catch((err) =>
      console.error("R2 profile deletion cleanup error:", err),
    );
  }
});

router.get("/profile/:id", async (req, res) => {
  const id = String(req.params.id);
  const [row] = await db.select().from(profiles).where(eq(profiles.id, id));
  if (!row) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }
  res.json(row);
});

router.put("/push-token", requireToken, async (req: AuthedRequest, res) => {
  const me = req.userToken!;
  const { pushToken } = req.body ?? {};
  // Only store tokens with the exact Expo push token format to prevent injection
  if (isValidExpoPushToken(pushToken)) {
    await db.update(profiles).set({ pushToken }).where(eq(profiles.id, me));
  }
  res.json({ ok: true });
});

// ---------- Go Live / Go Offline ----------
router.post("/go-live", requireToken, goLiveRateLimit, async (req: AuthedRequest, res) => {
  const token = req.userToken!;
  const body = req.body ?? {};
  const now = Date.now();

  const [profile] = await db
    .select({ name: profiles.name, isShadowBanned: profiles.isShadowBanned, latitude: profiles.latitude, longitude: profiles.longitude })
    .from(profiles)
    .where(eq(profiles.id, token))
    .limit(1);

  if (!profile) {
    res.status(404).json({ error: "Profile not found. Create your profile first." });
    return;
  }

  if (!profile.name) {
    res.status(400).json({ error: "Complete your profile before going live." });
    return;
  }

  if (profile.isShadowBanned) {
    res.json({ ok: true });
    return;
  }

  const lat = typeof body.latitude === "number" ? body.latitude : profile.latitude;
  const lon = typeof body.longitude === "number" ? body.longitude : profile.longitude;

  if (lat !== null && lon !== null && typeof lat === "number" && typeof lon === "number") {
    if (checkGpsJump(token, lat, lon)) {
      res.status(429).json({ error: "Location change too rapid. Please wait a moment." });
      return;
    }
    await db
      .update(profiles)
      .set({ isLive: true, isOnline: true, lastSeen: now, latitude: lat, longitude: lon })
      .where(eq(profiles.id, token));
  } else {
    await db
      .update(profiles)
      .set({ isLive: true, isOnline: true, lastSeen: now })
      .where(eq(profiles.id, token));
  }

  res.json({ ok: true, isLive: true });
});

router.post("/go-offline", requireToken, async (req: AuthedRequest, res) => {
  const token = req.userToken!;
  await db
    .update(profiles)
    .set({ isLive: false, isOnline: false })
    .where(eq(profiles.id, token));
  res.json({ ok: true, isLive: false });
});

// ---------- Heartbeat ----------
router.post("/heartbeat", requireToken, async (req: AuthedRequest, res) => {
  const token = req.userToken!;
  const body = req.body ?? {};
  const now = Date.now();
  const set: Record<string, unknown> = { lastSeen: now, isOnline: true };

  if (typeof body.latitude === "number" && typeof body.longitude === "number") {
    if (checkGpsJump(token, body.latitude, body.longitude)) {
      res.status(429).json({ error: "Location change too rapid." });
      return;
    }
    set.latitude = body.latitude;
    set.longitude = body.longitude;
  }

  await db.update(profiles).set(set).where(eq(profiles.id, token));
  res.json({ ok: true });
});

router.post("/offline", requireToken, async (req: AuthedRequest, res) => {
  const token = req.userToken!;
  await db.update(profiles).set({ isOnline: false }).where(eq(profiles.id, token));
  res.json({ ok: true });
});

// ---------- Nearby ----------

// Guest endpoint: count of live nearby users, no auth required
router.get("/nearby/count", async (req, res) => {
  const lat = parseFloat(String(req.query.lat ?? ""));
  const lon = parseFloat(String(req.query.lon ?? ""));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    res.json({ count: 0 });
    return;
  }
  const radiusMiles = 5;
  const now = Date.now();

  const rows = await db
    .select({ latitude: profiles.latitude, longitude: profiles.longitude, lastSeen: profiles.lastSeen })
    .from(profiles)
    .where(
      and(
        eq(profiles.isLive, true),
        eq(profiles.isShadowBanned, false),
        sql`${profiles.name} <> ''`,
        sql`${profiles.latitude} IS NOT NULL`,
        sql`${profiles.longitude} IS NOT NULL`,
      ),
    );

  const count = rows.filter((r) => {
    if (now - r.lastSeen > ONLINE_WINDOW_MS) return false;
    return distanceMiles(lat, lon, r.latitude as number, r.longitude as number) <= radiusMiles;
  }).length;

  res.json({ count });
});

router.get("/nearby", async (req, res) => {
  const lat = parseFloat(String(req.query.lat ?? ""));
  const lon = parseFloat(String(req.query.lon ?? ""));
  const token = (req.header("x-user-token") || "").trim() || null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    res.status(400).json({ error: "lat and lon are required" });
    return;
  }
  const radiusMiles = parseFloat(String(req.query.radius ?? "5"));
  const blockedIds = token
    ? (
        await db
          .select()
          .from(blocks)
          .where(or(eq(blocks.blockerId, token), eq(blocks.blockedId, token)))
      )
        .flatMap((b) => [b.blockerId, b.blockedId])
        .filter((id) => id !== token)
    : [];

  const rows = await db
    .select()
    .from(profiles)
    .where(
      and(
        eq(profiles.isLive, true),
        eq(profiles.isShadowBanned, false),
        sql`${profiles.name} <> ''`,
        sql`${profiles.latitude} IS NOT NULL`,
        sql`${profiles.longitude} IS NOT NULL`,
      ),
    );

  const now = Date.now();
  const withDistance = rows
    .filter((r) => !token || r.id !== token)
    .filter((r) => !blockedIds.includes(r.id))
    .filter((r) => now - r.lastSeen <= ONLINE_WINDOW_MS)
    .map((r) => ({
      ...r,
      isOnline: r.isOnline,
      distanceMiles: distanceMiles(
        lat,
        lon,
        r.latitude as number,
        r.longitude as number,
      ),
    }))
    .filter((r) => r.distanceMiles <= radiusMiles)
    .sort((a, b) => a.distanceMiles - b.distanceMiles);
  res.json(withDistance);
});

// ---------- Messages ----------
router.post("/messages", requireToken, messageRateLimit, async (req: AuthedRequest, res) => {
  const senderId = req.userToken!;
  const body = req.body ?? {};
  const recipientId = String(body.recipientId ?? "");
  const text = String(body.text ?? "").trim();

  if (!recipientId || !text) {
    res.status(400).json({ error: "recipientId and text required" });
    return;
  }

  // Cannot message yourself
  if (senderId === recipientId) {
    res.status(400).json({ error: "Cannot send messages to yourself." });
    return;
  }

  // Validate content: length, URLs, spam patterns
  const contentCheck = validateMessageContent(text);
  if (!contentCheck.valid) {
    res.status(400).json({ error: contentCheck.error });
    return;
  }

  const [senderProfile] = await db
    .select({ isShadowBanned: profiles.isShadowBanned, name: profiles.name })
    .from(profiles)
    .where(eq(profiles.id, senderId))
    .limit(1);

  // Must have a profile with a name to send messages
  if (!senderProfile || !senderProfile.name) {
    res.status(403).json({ error: "Complete your profile before sending messages." });
    return;
  }

  if (senderProfile.isShadowBanned) {
    // Silent accept to shadow-banned sender — they think it sent but recipient never sees it
    res.json({ id: randomUUID(), senderId, recipientId, text, timestamp: Date.now(), read: false });
    return;
  }

  const [blocked] = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.blockerId, recipientId), eq(blocks.blockedId, senderId)))
    .limit(1);
  if (blocked) {
    res.status(403).json({ error: "You are blocked by this user" });
    return;
  }

  const id = randomUUID();
  const timestamp = Date.now();
  const [row] = await db
    .insert(messages)
    .values({ id, senderId, recipientId, text, timestamp, read: false })
    .returning();
  res.json(row);

  const delivered = sendToUser(recipientId, { type: "message", message: row });
  if (!delivered) {
    const [[sender], [recipient]] = await Promise.all([
      db.select({ name: profiles.name }).from(profiles).where(eq(profiles.id, senderId)).limit(1),
      db.select({ pushToken: profiles.pushToken }).from(profiles).where(eq(profiles.id, recipientId)).limit(1),
    ]);
    if (recipient?.pushToken && isValidExpoPushToken(recipient.pushToken)) {
      sendExpoPush(recipient.pushToken, sender?.name ?? "New message", text, { senderId, notifType: "new_message" }).catch(() => {});
    }
  }
});

router.get("/messages/:peerId", requireToken, async (req: AuthedRequest, res) => {
  const me = req.userToken!;
  const peer = String(req.params.peerId);
  const after = req.query.after ? parseInt(String(req.query.after)) : 0;
  const rows = await db
    .select()
    .from(messages)
    .where(
      and(
        or(
          and(eq(messages.senderId, me), eq(messages.recipientId, peer)),
          and(eq(messages.senderId, peer), eq(messages.recipientId, me)),
        ),
        sql`${messages.timestamp} > ${after}`,
      ),
    )
    .orderBy(messages.timestamp);
  res.json(rows);
});

router.post("/messages/read/:peerId", requireToken, async (req: AuthedRequest, res) => {
  const me = req.userToken!;
  const peer = String(req.params.peerId);
  await db
    .update(messages)
    .set({ read: true })
    .where(
      and(
        eq(messages.senderId, peer),
        eq(messages.recipientId, me),
        eq(messages.read, false),
      ),
    );
  res.json({ ok: true });
});

router.get("/conversations", requireToken, async (req: AuthedRequest, res) => {
  const me = req.userToken!;
  const rows = await db.execute(sql`
    WITH msg AS (
      SELECT
        CASE WHEN sender_id = ${me} THEN recipient_id ELSE sender_id END AS peer_id,
        text,
        timestamp,
        sender_id,
        recipient_id,
        read
      FROM messages
      WHERE sender_id = ${me} OR recipient_id = ${me}
    ),
    latest AS (
      SELECT DISTINCT ON (peer_id) peer_id, text, timestamp
      FROM msg
      ORDER BY peer_id, timestamp DESC
    ),
    unread AS (
      SELECT sender_id AS peer_id, COUNT(*)::int AS unread_count
      FROM messages
      WHERE recipient_id = ${me} AND read = false
      GROUP BY sender_id
    )
    SELECT l.peer_id AS "userId",
           l.text   AS "lastMessage",
           l.timestamp AS "lastTimestamp",
           COALESCE(u.unread_count, 0) AS "unreadCount"
    FROM latest l
    LEFT JOIN unread u ON u.peer_id = l.peer_id
    ORDER BY l.timestamp DESC
  `);
  res.json(rows.rows);
});

router.delete("/messages/:peerId", requireToken, async (req: AuthedRequest, res) => {
  const me = req.userToken!;
  const peer = String(req.params.peerId);
  await db
    .delete(messages)
    .where(
      or(
        and(eq(messages.senderId, me), eq(messages.recipientId, peer)),
        and(eq(messages.senderId, peer), eq(messages.recipientId, me)),
      ),
    );
  res.json({ ok: true });
});

// ---------- Block ----------
router.post("/block/:peerId", requireToken, async (req: AuthedRequest, res) => {
  const me = req.userToken!;
  const peer = String(req.params.peerId);
  await db
    .insert(blocks)
    .values({ blockerId: me, blockedId: peer, createdAt: Date.now() })
    .onConflictDoNothing();
  res.json({ ok: true });
});

router.delete("/block/:peerId", requireToken, async (req: AuthedRequest, res) => {
  const me = req.userToken!;
  const peer = String(req.params.peerId);
  await db
    .delete(blocks)
    .where(and(eq(blocks.blockerId, me), eq(blocks.blockedId, peer)));
  res.json({ ok: true });
});

router.get("/blocks", requireToken, async (req: AuthedRequest, res) => {
  const me = req.userToken!;
  const rows = await db.select().from(blocks).where(eq(blocks.blockerId, me));
  res.json(rows.map((r) => r.blockedId));
});

// ---------- Hot Stuff ----------
router.post("/hot-stuff/:peerId", requireToken, async (req: AuthedRequest, res) => {
  const me = req.userToken!;
  const peer = String(req.params.peerId);
  const result = await db
    .insert(hotStuff)
    .values({ ownerId: me, targetId: peer, createdAt: Date.now() })
    .onConflictDoNothing()
    .returning();

  if (result.length > 0) {
    const [sender] = await db.select().from(profiles).where(eq(profiles.id, me)).limit(1);
    if (sender?.name) {
      const photos = Array.isArray(sender.photos) ? sender.photos : [];
      const cover = photos.find((p: { isLocked: boolean }) => !p.isLocked) ?? null;
      const now = Date.now();
      const cutoff = now - 24 * 3600_000;
      const [existing] = await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(
          and(
            eq(notifications.senderId, me),
            eq(notifications.recipientId, peer),
            eq(notifications.type, "liked_you"),
            sql`${notifications.createdAt} > ${cutoff}`,
          ),
        )
        .limit(1);
      if (!existing) {
        const notif = {
          id: randomUUID(),
          recipientId: peer,
          senderId: me,
          type: "liked_you" as const,
          senderName: sender.name,
          senderPhotoUri: cover ? (cover as { uri: string }).uri : null,
          read: false,
          createdAt: now,
        };
        await db.insert(notifications).values(notif);
        const delivered = sendToUser(peer, { type: "notification", notification: notif });
        if (!delivered) {
          const [peerRow] = await db.select({ pushToken: profiles.pushToken }).from(profiles).where(eq(profiles.id, peer)).limit(1);
          if (peerRow?.pushToken) {
            await sendExpoPush(peerRow.pushToken, `${sender.name} liked you!`, "Someone thinks you're hot stuff 🔥", { notifType: "liked_you" });
          }
        }
      }
    }
  }
  res.json({ ok: true });
});

router.delete("/hot-stuff/:peerId", requireToken, async (req: AuthedRequest, res) => {
  const me = req.userToken!;
  const peer = String(req.params.peerId);
  await db
    .delete(hotStuff)
    .where(and(eq(hotStuff.ownerId, me), eq(hotStuff.targetId, peer)));
  res.json({ ok: true });
});

router.get("/hot-stuff", requireToken, async (req: AuthedRequest, res) => {
  const me = req.userToken!;
  const rows = await db.select().from(hotStuff).where(eq(hotStuff.ownerId, me));
  res.json(rows.map((r) => r.targetId));
});

// ---------- Archive ----------
router.post("/archive/:peerId", requireToken, async (req: AuthedRequest, res) => {
  const me = req.userToken!;
  const peer = String(req.params.peerId);
  await db
    .insert(archived)
    .values({ ownerId: me, targetId: peer, createdAt: Date.now() })
    .onConflictDoNothing();
  res.json({ ok: true });
});

router.delete("/archive/:peerId", requireToken, async (req: AuthedRequest, res) => {
  const me = req.userToken!;
  const peer = String(req.params.peerId);
  await db
    .delete(archived)
    .where(and(eq(archived.ownerId, me), eq(archived.targetId, peer)));
  res.json({ ok: true });
});

router.get("/archive", requireToken, async (req: AuthedRequest, res) => {
  const me = req.userToken!;
  const rows = await db.select().from(archived).where(eq(archived.ownerId, me));
  res.json(rows.map((r) => r.targetId));
});

// ---------- Photo Unlocks ----------
router.post("/photo-unlock/:peerId", requireToken, async (req: AuthedRequest, res) => {
  const me = req.userToken!;
  const peer = String(req.params.peerId);
  await db
    .insert(photoUnlocks)
    .values({ granterId: me, granteeId: peer, createdAt: Date.now() })
    .onConflictDoNothing();
  res.json({ ok: true });
});

router.delete("/photo-unlock/:peerId", requireToken, async (req: AuthedRequest, res) => {
  const me = req.userToken!;
  const peer = String(req.params.peerId);
  await db
    .delete(photoUnlocks)
    .where(
      and(eq(photoUnlocks.granterId, me), eq(photoUnlocks.granteeId, peer)),
    );
  res.json({ ok: true });
});

router.get("/photo-unlocks/granted", requireToken, async (req: AuthedRequest, res) => {
  const me = req.userToken!;
  const rows = await db
    .select()
    .from(photoUnlocks)
    .where(eq(photoUnlocks.granterId, me));
  res.json(rows.map((r) => r.granteeId));
});

router.get("/photo-unlocks/received", requireToken, async (req: AuthedRequest, res) => {
  const me = req.userToken!;
  const rows = await db
    .select()
    .from(photoUnlocks)
    .where(eq(photoUnlocks.granteeId, me));
  res.json(rows.map((r) => r.granterId));
});

// ---------- Photo Unlock Requests (inbox) ----------
router.post(
  "/photo-unlock-requests/:targetId",
  requireToken,
  async (req: AuthedRequest, res) => {
    const me = req.userToken!;
    const target = String(req.params.targetId);
    if (!target || target === me) {
      res.status(400).json({ error: "Invalid target" });
      return;
    }
    const [existingGrant] = await db
      .select()
      .from(photoUnlocks)
      .where(
        and(
          eq(photoUnlocks.granterId, target),
          eq(photoUnlocks.granteeId, me),
        ),
      )
      .limit(1);
    if (existingGrant) {
      res.json({ ok: true, alreadyGranted: true });
      return;
    }
    await db
      .insert(photoUnlockRequests)
      .values({ requesterId: me, targetId: target, createdAt: Date.now() })
      .onConflictDoNothing();
    res.json({ ok: true });
  },
);

router.get(
  "/photo-unlock-requests/incoming",
  requireToken,
  async (req: AuthedRequest, res) => {
    const me = req.userToken!;
    const rows = await db
      .select({
        requesterId: photoUnlockRequests.requesterId,
        createdAt: photoUnlockRequests.createdAt,
        name: profiles.name,
        photos: profiles.photos,
        isOnline: profiles.isOnline,
        lastSeen: profiles.lastSeen,
      })
      .from(photoUnlockRequests)
      .leftJoin(profiles, eq(profiles.id, photoUnlockRequests.requesterId))
      .where(eq(photoUnlockRequests.targetId, me))
      .orderBy(sql`${photoUnlockRequests.createdAt} DESC`);
    const now = Date.now();
    res.json(
      rows.map((r) => {
        const photos = Array.isArray(r.photos) ? r.photos : [];
        const cover = photos.find((p) => !p.isLocked) ?? null;
        return {
          requesterId: r.requesterId,
          createdAt: r.createdAt,
          name: r.name ?? "",
          photoUri: cover?.uri ?? null,
          isOnline:
            !!r.isOnline &&
            typeof r.lastSeen === "number" &&
            now - r.lastSeen < ONLINE_WINDOW_MS,
        };
      }),
    );
  },
);

router.post(
  "/photo-unlock-requests/:requesterId/approve",
  requireToken,
  async (req: AuthedRequest, res) => {
    const me = req.userToken!;
    const requester = String(req.params.requesterId);
    await db
      .insert(photoUnlocks)
      .values({ granterId: me, granteeId: requester, createdAt: Date.now() })
      .onConflictDoNothing();
    await db
      .delete(photoUnlockRequests)
      .where(
        and(
          eq(photoUnlockRequests.requesterId, requester),
          eq(photoUnlockRequests.targetId, me),
        ),
      );
    sendToUser(requester, { type: "unlock_approved", granterId: me });
    res.json({ ok: true });
  },
);

router.post(
  "/photo-unlock-requests/:requesterId/deny",
  requireToken,
  async (req: AuthedRequest, res) => {
    const me = req.userToken!;
    const requester = String(req.params.requesterId);
    await db
      .delete(photoUnlockRequests)
      .where(
        and(
          eq(photoUnlockRequests.requesterId, requester),
          eq(photoUnlockRequests.targetId, me),
        ),
      );
    res.json({ ok: true });
  },
);

// ---------- Profile view ----------
router.post("/profile-view/:targetId", requireToken, async (req: AuthedRequest, res) => {
  const me = req.userToken!;
  const target = String(req.params.targetId);
  if (me === target) { res.json({ ok: true }); return; }

  const [sender] = await db.select().from(profiles).where(eq(profiles.id, me)).limit(1);
  if (!sender?.name) { res.json({ ok: true }); return; }

  const now = Date.now();
  const cutoff = now - 4 * 3600_000;
  const [existing] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.senderId, me),
        eq(notifications.recipientId, target),
        eq(notifications.type, "profile_view"),
        sql`${notifications.createdAt} > ${cutoff}`,
      ),
    )
    .limit(1);
  if (existing) { res.json({ ok: true }); return; }

  const photos = Array.isArray(sender.photos) ? sender.photos : [];
  const cover = photos.find((p: { isLocked: boolean }) => !p.isLocked) ?? null;
  const notif = {
    id: randomUUID(),
    recipientId: target,
    senderId: me,
    type: "profile_view" as const,
    senderName: sender.name,
    senderPhotoUri: cover ? (cover as { uri: string }).uri : null,
    read: false,
    createdAt: now,
  };
  await db.insert(notifications).values(notif);
  const delivered = sendToUser(target, { type: "notification", notification: notif });
  if (!delivered) {
    const [targetRow] = await db.select({ pushToken: profiles.pushToken }).from(profiles).where(eq(profiles.id, target)).limit(1);
    if (targetRow?.pushToken) {
      await sendExpoPush(targetRow.pushToken, `${sender.name} viewed your profile`, "Someone checked you out 👀", { notifType: "profile_view" });
    }
  }
  res.json({ ok: true });
});

// ---------- Notifications ----------
router.get("/notifications", requireToken, async (req: AuthedRequest, res) => {
  const me = req.userToken!;
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.recipientId, me))
    .orderBy(sql`${notifications.createdAt} DESC`)
    .limit(50);
  res.json(rows);
});

router.post("/notifications/read", requireToken, async (req: AuthedRequest, res) => {
  const me = req.userToken!;
  await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.recipientId, me), eq(notifications.read, false)));
  res.json({ ok: true });
});

export default router;
