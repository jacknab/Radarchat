import { db } from "@workspace/db";
import { profiles, messages, photoUnlockRequests, photoUnlocks, notifications, hotStuff } from "@workspace/db/schema";
import { eq, not, like, and, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { logger } from "./logger";
import { sendToUser, isUserConnected } from "./ws";
import { sendExpoPush } from "./push";

const SEED_PREFIX = "seed_uptown_";

// Denver — used only as the stored DB lat/lon placeholder.  The real positions
// seeded profiles show up at are computed per-query in the /nearby route using
// the offsets below (user's lat + dLat, user's lon + dLon).
const DENVER_LAT = 39.7415;
const DENVER_LON = -104.9758;

// ─── Per-profile offsets (exported for /nearby virtual positioning) ───────────
// Each guy has a fixed relative offset (in degrees) from whoever is querying
// /nearby.  At query time the route adds these to the real user's lat/lon so
// the seeded profiles always scatter naturally around that user — wherever
// in the world they happen to be.
export const SEED_OFFSETS: { id: string; dLat: number; dLon: number }[] = [];

// Each guy's position is defined as a relative offset (dLat, dLon) from the
// cluster center — which is recalculated from real users' locations on every
// keepalive tick. This way seeded profiles always appear near whoever is using
// the app, regardless of where in the world they are.
//
// Offsets keep the original Denver spread (~500 m radius), so the guys feel
// naturally scattered around the user — not all stacked on the same pin.
const ROSTER: {
  slug: string;
  name: string;
  age: string;
  position: string;
  bodyType: string;
  endowment: string;
  lookingFor: string;
  hosting: string;
  cockSize: string;
  into: string;
  dLat: number;   // degrees offset from cluster center
  dLon: number;
  publicPhotos: number[];
  privatePhotos: number[];
}[] = [
  {
    slug: "marcus", name: "Marcus", age: "29", position: "Top", bodyType: "Athletic",
    endowment: "Cut", lookingFor: "Right Now", hosting: "Can Host", cockSize: "7.5",
    into: "Oral,Anal,NSA", dLat: 0.0000, dLon: 0.0000,
    publicPhotos: [3], privatePhotos: [13, 23],
  },
  {
    slug: "jaylen", name: "Jaylen", age: "26", position: "Versatile", bodyType: "Muscular",
    endowment: "Uncut", lookingFor: "Tonight", hosting: "Host & Travel", cockSize: "8.0",
    into: "Oral,Anal,Kissing", dLat: -0.0015, dLon: -0.0022,
    publicPhotos: [7, 17], privatePhotos: [27],
  },
  {
    slug: "bryce", name: "Bryce", age: "33", position: "Bottom", bodyType: "Slim",
    endowment: "Cut", lookingFor: "Discreet", hosting: "Can Travel", cockSize: "6.0",
    into: "Oral,Rimming,Discreet", dLat: 0.0015, dLon: 0.0018,
    publicPhotos: [11], privatePhotos: [],
  },
  {
    slug: "cole", name: "Cole", age: "31", position: "Vers Top", bodyType: "Athletic",
    endowment: "Cut", lookingFor: "Regular", hosting: "Can Host", cockSize: "7.0",
    into: "Oral,Anal,Raw", dLat: -0.0025, dLon: 0.0038,
    publicPhotos: [15, 25], privatePhotos: [35],
  },
  {
    slug: "drew", name: "Drew", age: "24", position: "Bottom", bodyType: "Average",
    endowment: "Uncut", lookingFor: "Right Now", hosting: "No Host", cockSize: "5.5",
    into: "Oral,Kissing,JO / Mutual", dLat: -0.0040, dLon: -0.0007,
    publicPhotos: [19], privatePhotos: [29, 39],
  },
  {
    slug: "ryan", name: "Ryan", age: "38", position: "Top", bodyType: "Heavyset",
    endowment: "Cut", lookingFor: "Tonight", hosting: "Can Host", cockSize: "7.0",
    into: "Anal,NSA,Discreet", dLat: 0.0005, dLon: 0.0058,
    publicPhotos: [22, 32], privatePhotos: [],
  },
  {
    slug: "eli", name: "Eli", age: "27", position: "Versatile", bodyType: "Slim",
    endowment: "Uncut", lookingFor: "This Week", hosting: "Host & Travel", cockSize: "6.5",
    into: "Oral,Rimming,Anal", dLat: -0.0017, dLon: 0.0023,
    publicPhotos: [41], privatePhotos: [51],
  },
  {
    slug: "nate", name: "Nate", age: "35", position: "Side", bodyType: "Athletic",
    endowment: "Cut", lookingFor: "Regular", hosting: "Can Travel", cockSize: "6.0",
    into: "JO / Mutual,Oral,Kissing", dLat: -0.0005, dLon: -0.0012,
    publicPhotos: [44, 54], privatePhotos: [],
  },
  {
    slug: "travis", name: "Travis", age: "30", position: "Vers Bottom", bodyType: "Stocky",
    endowment: "Cut", lookingFor: "Right Now", hosting: "Can Host", cockSize: "6.5",
    into: "Anal,Kink,Raw", dLat: -0.0030, dLon: 0.0008,
    publicPhotos: [48], privatePhotos: [58, 68],
  },
  {
    slug: "derek", name: "Derek", age: "42", position: "Top", bodyType: "Muscular",
    endowment: "Uncut", lookingFor: "Discreet", hosting: "No Host", cockSize: "8.0",
    into: "Oral,Anal,Discreet", dLat: 0.0020, dLon: 0.0003,
    publicPhotos: [53], privatePhotos: [],
  },
  {
    slug: "kyle", name: "Kyle", age: "23", position: "Bottom", bodyType: "Slim",
    endowment: "Cut", lookingFor: "Tonight", hosting: "Host & Travel", cockSize: "5.5",
    into: "Oral,Kissing,Regular", dLat: -0.0047, dLon: 0.0028,
    publicPhotos: [56, 66], privatePhotos: [36],
  },
  {
    slug: "sean", name: "Sean", age: "45", position: "Versatile", bodyType: "Average",
    endowment: "Cut", lookingFor: "Regular", hosting: "Can Host", cockSize: "7.0",
    into: "Oral,Anal,Outdoors", dLat: -0.0020, dLon: 0.0050,
    publicPhotos: [60], privatePhotos: [],
  },
  {
    slug: "brandon", name: "Brandon", age: "28", position: "Top", bodyType: "Athletic",
    endowment: "Uncut", lookingFor: "Right Now", hosting: "Can Host", cockSize: "7.5",
    into: "Raw,Anal,NSA", dLat: 0.0007, dLon: 0.0016,
    publicPhotos: [62, 2], privatePhotos: [12],
  },
  {
    slug: "adam", name: "Adam", age: "36", position: "Vers Top", bodyType: "Muscular",
    endowment: "Cut", lookingFor: "This Week", hosting: "Can Travel", cockSize: "7.0",
    into: "Kink,Anal,Toys", dLat: -0.0037, dLon: 0.0043,
    publicPhotos: [64], privatePhotos: [4, 14],
  },
  {
    slug: "chris", name: "Chris", age: "32", position: "Bottom", bodyType: "Average",
    endowment: "Uncut", lookingFor: "Tonight", hosting: "No Host", cockSize: "6.0",
    into: "Oral,Rimming,Kissing", dLat: 0.0025, dLon: 0.0030,
    publicPhotos: [9, 18], privatePhotos: [],
  },
  {
    slug: "mike", name: "Mike", age: "40", position: "Top", bodyType: "Heavyset",
    endowment: "Cut", lookingFor: "Discreet", hosting: "Can Host", cockSize: "7.5",
    into: "Discreet,NSA,Anal", dLat: -0.0053, dLon: 0.0000,
    publicPhotos: [20], privatePhotos: [30, 50],
  },
];

// Populate exported offsets now that ROSTER is defined.
// The /nearby route uses these to compute each seeded guy's virtual position
// relative to the querying user — so they always appear nearby regardless of
// where in the world the user is.
ROSTER.forEach((g) => {
  SEED_OFFSETS.push({ id: `${SEED_PREFIX}${g.slug}`, dLat: g.dLat, dLon: g.dLon });
});

// ─── Initial drip schedule ────────────────────────────────────────────────────
const DRIP_MINUTES: number[][] = [
  [0, 1],   // Marcus, Jaylen  — minute 0
  [2],      // Bryce            — minute 2
  [3, 4],   // Cole, Drew       — minute 4
  [5],      // Ryan             — minute 7
  [6, 7],   // Eli, Nate        — minute 9
  [8],      // Travis           — minute 12
  [9, 10],  // Derek, Kyle      — minute 14
  [11],     // Sean             — minute 17
  [12, 13], // Brandon, Adam    — minute 19
  [14],     // Chris            — minute 22
  [15],     // Mike             — minute 25
];

const DRIP_DELAY_MINS = [0, 2, 4, 7, 9, 12, 14, 17, 19, 22, 25];

// ─── Steady-state churn ───────────────────────────────────────────────────────
const CHURN_INTERVAL_MS   = 4 * 60_000;
const OFFLINE_DURATION_MS = 6 * 60_000;
const KEEPALIVE_INTERVAL_MS = 60_000;

const onlineSlugs = new Set<string>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildPhotos(publicNums: number[], privateNums: number[]) {
  const photos: { id: string; uri: string; thumbnailUri: string; isLocked: boolean }[] = [];
  for (const n of publicNums) {
    const uri = `https://randomuser.me/api/portraits/men/${n}.jpg`;
    photos.push({ id: `sp_pub_${n}`, uri, thumbnailUri: uri, isLocked: false });
  }
  for (const n of privateNums) {
    const uri = `https://randomuser.me/api/portraits/men/${n}.jpg`;
    photos.push({ id: `sp_priv_${n}`, uri, thumbnailUri: uri, isLocked: true });
  }
  return photos;
}

function pickRandom<T>(arr: T[], count: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, count);
}

async function bringOnline(rosterIdx: number) {
  const guy = ROSTER[rosterIdx];
  if (!guy) return;
  const id = `${SEED_PREFIX}${guy.slug}`;
  const now = Date.now();
  const photos = buildPhotos(guy.publicPhotos, guy.privatePhotos);
  // Stored lat/lon is a Denver placeholder — actual positions for /nearby are
  // computed per-query by adding dLat/dLon to the real user's location.
  const storedLat = DENVER_LAT + guy.dLat;
  const storedLon = DENVER_LON + guy.dLon;

  await db
    .insert(profiles)
    .values({
      id, name: guy.name, age: guy.age, position: guy.position,
      bodyType: guy.bodyType, endowment: guy.endowment, lookingFor: guy.lookingFor,
      hosting: guy.hosting, cockSize: guy.cockSize, into: guy.into, photos,
      isOnline: true, isLive: true, isShadowBanned: false,
      lastSeen: now, latitude: storedLat, longitude: storedLon, createdAt: now,
    })
    .onConflictDoUpdate({
      target: profiles.id,
      set: { isOnline: true, isLive: true, lastSeen: now },
    });

  onlineSlugs.add(guy.slug);
  logger.info({ name: guy.name }, "Seed guy came online");
}

async function takeOffline(slug: string) {
  const id = `${SEED_PREFIX}${slug}`;
  await db
    .update(profiles)
    .set({ isOnline: false, isLive: false })
    .where(eq(profiles.id, id));
  onlineSlugs.delete(slug);
  logger.info({ slug }, "Seed guy went offline");
}

async function bringSlugOnline(slug: string) {
  const now = Date.now();
  await db
    .update(profiles)
    .set({ isOnline: true, isLive: true, lastSeen: now })
    .where(eq(profiles.id, `${SEED_PREFIX}${slug}`));
  onlineSlugs.add(slug);
  logger.info({ slug }, "Seed guy came back online");
}

async function keepalive() {
  // Just touch lastSeen so live seeded profiles don't time out.
  // Actual positions are computed per-query in /nearby using SEED_OFFSETS.
  const now = Date.now();
  await db
    .update(profiles)
    .set({ lastSeen: now })
    .where(sql`${profiles.id} LIKE ${"seed_uptown_%"} AND ${profiles.isLive} = true`);
}

// ─── Message simulation ───────────────────────────────────────────────────────
const GUY_MESSAGES: Record<string, string[]> = {
  marcus:  ["Hey 👋", "you nearby?", "what's up", "into anything fun rn?", "you free tonight?", "hey you're cute", "wanna hang?"],
  jaylen:  ["sup man", "you looking?", "what are you into?", "hey", "wanna meet up?", "you host?", "free now?"],
  bryce:   ["hi there 😊", "you seem cool", "hey cutie", "what's good?", "you around?", "into anything tonight?"],
  cole:    ["hey man", "looking?", "you close by?", "what's up", "free tonight?", "you top or bottom?", "wanna connect?"],
  drew:    ["heyyy", "omg you're hot", "hi 😍", "what are you up to?", "you free?", "hey cutie 👀"],
  ryan:    ["hey", "wanna meet?", "discreet here, you?", "you host?", "what's up man", "free later?"],
  eli:     ["hey 👋", "you around?", "into vers guys?", "wanna hang tonight?", "what are you looking for?", "hey handsome"],
  nate:    ["hi there", "you seem cool", "what's good?", "looking for anything?", "you nearby?", "hey man"],
  travis:  ["hey", "you looking rn?", "wanna meet up?", "into anything raw?", "free tonight?", "what's up"],
  derek:   ["hey", "discreet here", "you host?", "wanna meet?", "what are you into?", "you free?"],
  kyle:    ["hiiii", "omg hey", "you're cute 😊", "wanna hang?", "what are you up to?", "hey you!"],
  sean:    ["hey man", "you around?", "looking?", "what's up", "you free tonight?", "into anything fun?"],
  brandon: ["hey", "you looking?", "wanna meet up rn?", "you host?", "what's good", "free?"],
  adam:    ["hey there", "you into kink at all?", "wanna connect?", "looking for anything?", "what's up man"],
  chris:   ["hi 😊", "you seem nice", "what are you looking for?", "hey cutie", "wanna chat?", "you around?"],
  mike:    ["hey", "discreet — you?", "wanna meet?", "you free?", "what's up", "looking for fun tonight"],
};

const MSG_MIN_INTERVAL_MS = 90_000;
const MSG_MAX_INTERVAL_MS = 4 * 60_000;
const MSG_START_DELAY_MS  = 20_000;

async function getRealUserIds(): Promise<string[]> {
  const rows = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(not(like(profiles.id, "seed%")));
  return rows.map((r) => r.id);
}

function pickMessage(slug: string): string {
  const pool = GUY_MESSAGES[slug] ?? ["hey", "what's up?", "you around?"];
  return pool[Math.floor(Math.random() * pool.length)]!;
}

async function sendSimulatedMessage() {
  if (onlineSlugs.size === 0) return;
  const realIds = await getRealUserIds();
  if (realIds.length === 0) return;

  const recipientId = realIds[Math.floor(Math.random() * realIds.length)]!;
  const slugs = Array.from(onlineSlugs);
  const senderSlug = slugs[Math.floor(Math.random() * slugs.length)]!;
  const senderId = `${SEED_PREFIX}${senderSlug}`;
  const text = pickMessage(senderSlug);
  const senderName = ROSTER.find((g) => g.slug === senderSlug)?.name ?? senderSlug;

  const id = randomUUID();
  const timestamp = Date.now();

  const [row] = await db
    .insert(messages)
    .values({ id, senderId, recipientId, text, timestamp, read: false })
    .returning();

  if (row) {
    sendToUser(recipientId, { type: "message", message: row });
    logger.info({ from: senderName, to: recipientId, text }, "Seeder sent message");
  }
}

function scheduleNextMessage() {
  const delay = MSG_MIN_INTERVAL_MS + Math.random() * (MSG_MAX_INTERVAL_MS - MSG_MIN_INTERVAL_MS);
  setTimeout(() => {
    sendSimulatedMessage()
      .catch((err) => logger.error({ err }, "Seeder message error"))
      .finally(() => scheduleNextMessage());
  }, delay);
}

// ─── Photo unlock simulation ──────────────────────────────────────────────────
const UNLOCK_RESPOND_INTERVAL_MS = 90_000;
const UNLOCK_SEND_MIN_MS  = 10 * 60_000;
const UNLOCK_SEND_MAX_MS  = 20 * 60_000;
const UNLOCK_SEND_START_MS = 60_000;
const ACCEPT_CHANCE = 0.6;

async function respondToUnlockRequests() {
  const pending = await db
    .select({ requesterId: photoUnlockRequests.requesterId, targetId: photoUnlockRequests.targetId })
    .from(photoUnlockRequests)
    .where(like(photoUnlockRequests.targetId, `${SEED_PREFIX}%`));

  for (const req of pending) {
    if (Math.random() < ACCEPT_CHANCE) {
      const delay = 30_000 + Math.random() * 3 * 60_000;
      setTimeout(async () => {
        try {
          await db
            .insert(photoUnlocks)
            .values({ granterId: req.targetId, granteeId: req.requesterId, createdAt: Date.now() })
            .onConflictDoNothing();
          await db
            .delete(photoUnlockRequests)
            .where(and(
              eq(photoUnlockRequests.requesterId, req.requesterId),
              eq(photoUnlockRequests.targetId, req.targetId),
            ));
          sendToUser(req.requesterId, { type: "unlock_approved", granterId: req.targetId });
          const guyName = ROSTER.find((g) => `${SEED_PREFIX}${g.slug}` === req.targetId)?.name ?? "Someone";
          logger.info({ from: guyName, to: req.requesterId }, "Seed guy approved unlock request");
        } catch (err) {
          logger.error({ err }, "Seeder approveUnlock error");
        }
      }, delay);
    } else {
      const delay = 5 * 60_000 + Math.random() * 5 * 60_000;
      setTimeout(async () => {
        try {
          await db
            .delete(photoUnlockRequests)
            .where(and(
              eq(photoUnlockRequests.requesterId, req.requesterId),
              eq(photoUnlockRequests.targetId, req.targetId),
            ));
          logger.info({ targetId: req.targetId }, "Seed guy silently ignored unlock request");
        } catch (err) {
          logger.error({ err }, "Seeder ignoreUnlock error");
        }
      }, delay);
    }
  }
}

async function sendRandomUnlockRequest() {
  if (onlineSlugs.size === 0) return;
  const realIds = await getRealUserIds();
  if (realIds.length === 0) return;

  const eligibleSlugs = Array.from(onlineSlugs).filter((s) => {
    const guy = ROSTER.find((g) => g.slug === s);
    return guy && guy.privatePhotos.length > 0;
  });
  if (eligibleSlugs.length === 0) return;

  const recipientId = realIds[Math.floor(Math.random() * realIds.length)]!;
  const senderSlug  = eligibleSlugs[Math.floor(Math.random() * eligibleSlugs.length)]!;
  const senderId    = `${SEED_PREFIX}${senderSlug}`;
  const senderGuy   = ROSTER.find((g) => g.slug === senderSlug)!;

  const [[existingReq], [existingGrant]] = await Promise.all([
    db.select().from(photoUnlockRequests)
      .where(and(eq(photoUnlockRequests.requesterId, senderId), eq(photoUnlockRequests.targetId, recipientId)))
      .limit(1),
    db.select().from(photoUnlocks)
      .where(and(eq(photoUnlocks.granterId, recipientId), eq(photoUnlocks.granteeId, senderId)))
      .limit(1),
  ]);
  if (existingReq || existingGrant) return;

  await db
    .insert(photoUnlockRequests)
    .values({ requesterId: senderId, targetId: recipientId, createdAt: Date.now() })
    .onConflictDoNothing();

  const publicPhotoUri = senderGuy.publicPhotos[0]
    ? `https://randomuser.me/api/portraits/men/${senderGuy.publicPhotos[0]}.jpg`
    : null;

  sendToUser(recipientId, {
    type: "unlock_request",
    request: {
      requesterId: senderId,
      name: senderGuy.name,
      photoUri: publicPhotoUri,
      isOnline: true,
      createdAt: Date.now(),
    },
  });

  if (!isUserConnected(recipientId)) {
    const [recipient] = await db
      .select({ pushToken: profiles.pushToken })
      .from(profiles)
      .where(eq(profiles.id, recipientId))
      .limit(1);
    if (recipient?.pushToken) {
      sendExpoPush(
        recipient.pushToken,
        senderGuy.name,
        "wants to see your private photos 📸",
        { senderId, notifType: "unlock_request" },
      ).catch(() => {});
    }
  }

  logger.info({ from: senderGuy.name, to: recipientId }, "Seed guy sent unlock request");
}

function scheduleNextUnlockRequest() {
  const delay = UNLOCK_SEND_MIN_MS + Math.random() * (UNLOCK_SEND_MAX_MS - UNLOCK_SEND_MIN_MS);
  setTimeout(() => {
    sendRandomUnlockRequest()
      .catch((err) => logger.error({ err }, "Seeder unlock request error"))
      .finally(() => scheduleNextUnlockRequest());
  }, delay);
}

// ─── Seed ↔ Seed: messages ────────────────────────────────────────────────────
// Two random online seeds exchange a message.  40 % chance the recipient
// replies after a short human-like pause.  Messages are marked read=true
// immediately since neither party is a real device.
const S2S_MSG_MIN_MS   = 2 * 60_000;
const S2S_MSG_MAX_MS   = 6 * 60_000;
const S2S_MSG_START_MS = 3 * 60_000;

async function sendSeedToSeedMessage() {
  const slugs = Array.from(onlineSlugs);
  if (slugs.length < 2) return;

  const senderSlug    = slugs[Math.floor(Math.random() * slugs.length)]!;
  const others        = slugs.filter((s) => s !== senderSlug);
  const recipientSlug = others[Math.floor(Math.random() * others.length)]!;
  const senderId      = `${SEED_PREFIX}${senderSlug}`;
  const recipientId   = `${SEED_PREFIX}${recipientSlug}`;
  const text          = pickMessage(senderSlug);

  await db.insert(messages).values({
    id: randomUUID(), senderId, recipientId, text, timestamp: Date.now(), read: true,
  });
  logger.info({ from: senderSlug, to: recipientSlug, text }, "Seed → Seed message");

  // 40 % chance the recipient fires back
  if (Math.random() < 0.4) {
    const pause = 15_000 + Math.random() * 90_000;
    setTimeout(async () => {
      try {
        const reply = pickMessage(recipientSlug);
        await db.insert(messages).values({
          id: randomUUID(), senderId: recipientId, recipientId: senderId,
          text: reply, timestamp: Date.now(), read: true,
        });
        logger.info({ from: recipientSlug, to: senderSlug, reply }, "Seed → Seed reply");
      } catch (err) { logger.error({ err }, "Seed reply error"); }
    }, pause);
  }
}

function scheduleNextSeedMessage() {
  const delay = S2S_MSG_MIN_MS + Math.random() * (S2S_MSG_MAX_MS - S2S_MSG_MIN_MS);
  setTimeout(() => {
    sendSeedToSeedMessage()
      .catch((err) => logger.error({ err }, "Seed-to-seed message error"))
      .finally(() => scheduleNextSeedMessage());
  }, delay);
}

// ─── Seed → Seed: profile views ───────────────────────────────────────────────
// One seed views another's profile.  Writes a real notification row (same
// dedup logic as the /profile-view route: max once per pair per 4 h).
const S2S_VIEW_MIN_MS   = 5 * 60_000;
const S2S_VIEW_MAX_MS   = 10 * 60_000;
const S2S_VIEW_START_MS = 2 * 60_000;

async function seedViewProfile() {
  const slugs = Array.from(onlineSlugs);
  if (slugs.length < 2) return;

  const viewerSlug = slugs[Math.floor(Math.random() * slugs.length)]!;
  const others     = slugs.filter((s) => s !== viewerSlug);
  const targetSlug = others[Math.floor(Math.random() * others.length)]!;
  const viewerId   = `${SEED_PREFIX}${viewerSlug}`;
  const targetId   = `${SEED_PREFIX}${targetSlug}`;
  const viewer     = ROSTER.find((g) => g.slug === viewerSlug)!;
  const now        = Date.now();
  const cutoff     = now - 4 * 3600_000;

  const [existing] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.senderId, viewerId),
        eq(notifications.recipientId, targetId),
        eq(notifications.type, "profile_view"),
        sql`${notifications.createdAt} > ${cutoff}`,
      ),
    )
    .limit(1);
  if (existing) return;

  const photoUri = viewer.publicPhotos[0]
    ? `https://randomuser.me/api/portraits/men/${viewer.publicPhotos[0]}.jpg`
    : null;

  await db.insert(notifications).values({
    id: randomUUID(), recipientId: targetId, senderId: viewerId,
    type: "profile_view", senderName: viewer.name,
    senderPhotoUri: photoUri, read: false, createdAt: now,
  });
  logger.info({ viewer: viewerSlug, target: targetSlug }, "Seed viewed Seed profile");
}

function scheduleNextSeedView() {
  const delay = S2S_VIEW_MIN_MS + Math.random() * (S2S_VIEW_MAX_MS - S2S_VIEW_MIN_MS);
  setTimeout(() => {
    seedViewProfile()
      .catch((err) => logger.error({ err }, "Seed-view error"))
      .finally(() => scheduleNextSeedView());
  }, delay);
}

// ─── Seed ↔ Seed: photo unlock requests ──────────────────────────────────────
// A seed with private photos requests access from another seed.
// The target auto-grants after a 1–5 min delay (seeds always accept each other).
const S2S_UNLOCK_MIN_MS   = 15 * 60_000;
const S2S_UNLOCK_MAX_MS   = 30 * 60_000;
const S2S_UNLOCK_START_MS =  5 * 60_000;

async function sendSeedToSeedUnlockRequest() {
  const eligibleSlugs = Array.from(onlineSlugs).filter((s) => {
    const g = ROSTER.find((r) => r.slug === s);
    return g && g.privatePhotos.length > 0;
  });
  if (eligibleSlugs.length === 0) return;

  const senderSlug    = eligibleSlugs[Math.floor(Math.random() * eligibleSlugs.length)]!;
  const others        = Array.from(onlineSlugs).filter((s) => s !== senderSlug);
  if (others.length === 0) return;
  const recipientSlug = others[Math.floor(Math.random() * others.length)]!;
  const senderId      = `${SEED_PREFIX}${senderSlug}`;
  const recipientId   = `${SEED_PREFIX}${recipientSlug}`;

  // Skip if already pending or already granted
  const [[existingReq], [existingGrant]] = await Promise.all([
    db.select().from(photoUnlockRequests)
      .where(and(eq(photoUnlockRequests.requesterId, senderId), eq(photoUnlockRequests.targetId, recipientId)))
      .limit(1),
    db.select().from(photoUnlocks)
      .where(and(eq(photoUnlocks.granterId, recipientId), eq(photoUnlocks.granteeId, senderId)))
      .limit(1),
  ]);
  if (existingReq || existingGrant) return;

  await db
    .insert(photoUnlockRequests)
    .values({ requesterId: senderId, targetId: recipientId, createdAt: Date.now() })
    .onConflictDoNothing();

  logger.info({ from: senderSlug, to: recipientSlug }, "Seed requested Seed unlock");

  // Auto-grant — seeds always unlock each other
  const grantDelay = 60_000 + Math.random() * 4 * 60_000;
  setTimeout(async () => {
    try {
      await db
        .insert(photoUnlocks)
        .values({ granterId: recipientId, granteeId: senderId, createdAt: Date.now() })
        .onConflictDoNothing();
      await db
        .delete(photoUnlockRequests)
        .where(
          and(
            eq(photoUnlockRequests.requesterId, senderId),
            eq(photoUnlockRequests.targetId, recipientId),
          ),
        );
      logger.info({ from: recipientSlug, to: senderSlug }, "Seed granted Seed unlock");
    } catch (err) { logger.error({ err }, "Seed-to-seed grant error"); }
  }, grantDelay);
}

function scheduleNextSeedUnlockRequest() {
  const delay = S2S_UNLOCK_MIN_MS + Math.random() * (S2S_UNLOCK_MAX_MS - S2S_UNLOCK_MIN_MS);
  setTimeout(() => {
    sendSeedToSeedUnlockRequest()
      .catch((err) => logger.error({ err }, "Seed-to-seed unlock error"))
      .finally(() => scheduleNextSeedUnlockRequest());
  }, delay);
}

// ─── Seed → Seed: hot-stuff (likes) ──────────────────────────────────────────
// One seed marks another as hot.  onConflictDoNothing prevents duplicates.
const S2S_HOT_MIN_MS   = 15 * 60_000;
const S2S_HOT_MAX_MS   = 25 * 60_000;
const S2S_HOT_START_MS =  8 * 60_000;

async function seedHotStuff() {
  const slugs = Array.from(onlineSlugs);
  if (slugs.length < 2) return;

  const ownerSlug  = slugs[Math.floor(Math.random() * slugs.length)]!;
  const others     = slugs.filter((s) => s !== ownerSlug);
  const targetSlug = others[Math.floor(Math.random() * others.length)]!;
  const ownerId    = `${SEED_PREFIX}${ownerSlug}`;
  const targetId   = `${SEED_PREFIX}${targetSlug}`;

  await db
    .insert(hotStuff)
    .values({ ownerId, targetId, createdAt: Date.now() })
    .onConflictDoNothing();

  logger.info({ owner: ownerSlug, target: targetSlug }, "Seed liked Seed (hot-stuff)");
}

function scheduleNextSeedHotStuff() {
  const delay = S2S_HOT_MIN_MS + Math.random() * (S2S_HOT_MAX_MS - S2S_HOT_MIN_MS);
  setTimeout(() => {
    seedHotStuff()
      .catch((err) => logger.error({ err }, "Seed-to-seed hot-stuff error"))
      .finally(() => scheduleNextSeedHotStuff());
  }, delay);
}

// ─── Churn loop ───────────────────────────────────────────────────────────────
function startChurn() {
  setInterval(() => {
    if (onlineSlugs.size === 0) return;

    const dropCount = Math.floor(Math.random() * 3) + 1;
    const toDrop = pickRandom(Array.from(onlineSlugs), Math.min(dropCount, onlineSlugs.size));

    for (const slug of toDrop) {
      takeOffline(slug).catch((err) => logger.error({ err, slug }, "Churn takeOffline error"));

      const jitter = Math.random() * 3 * 60_000;
      setTimeout(() => {
        bringSlugOnline(slug).catch((err) =>
          logger.error({ err, slug }, "Churn bringOnline error"),
        );
      }, OFFLINE_DURATION_MS + jitter);
    }
  }, CHURN_INTERVAL_MS);
}

// ─── Entry point ──────────────────────────────────────────────────────────────
export function startSeeder() {
  // Schedule initial drip — positions are stored as Denver placeholders;
  // the /nearby route computes virtual positions per-query from SEED_OFFSETS.
  for (let batchIdx = 0; batchIdx < DRIP_MINUTES.length; batchIdx++) {
    const rosterIndices = DRIP_MINUTES[batchIdx]!;
    const delayMs = (DRIP_DELAY_MINS[batchIdx] ?? 0) * 60_000;

    for (const rIdx of rosterIndices) {
      setTimeout(() => {
        bringOnline(rIdx).catch((err) =>
          logger.error({ err, rIdx }, "Seeder drip error"),
        );
      }, delayMs);
    }
  }

  // Churn starts after all guys are online
  setTimeout(() => {
    startChurn();
    logger.info("Seeder entered steady-state churn — running indefinitely");
  }, 26 * 60_000);

  // Keepalive: refresh cluster center + reposition all online guys every 60 s
  setInterval(() => {
    keepalive().catch((err) => logger.error({ err }, "Seeder keepalive error"));
  }, KEEPALIVE_INTERVAL_MS);

  // Message simulation
  setTimeout(() => {
    sendSimulatedMessage()
      .catch((err) => logger.error({ err }, "Seeder first message error"))
      .finally(() => scheduleNextMessage());
  }, MSG_START_DELAY_MS);

  // Unlock request simulation — poll every 90s for responses
  setInterval(() => {
    respondToUnlockRequests().catch((err) => logger.error({ err }, "Seeder respondToUnlock error"));
  }, UNLOCK_RESPOND_INTERVAL_MS);

  // Proactive unlock requests from seeded guys → real users
  setTimeout(() => {
    sendRandomUnlockRequest()
      .catch((err) => logger.error({ err }, "Seeder first unlock request error"))
      .finally(() => scheduleNextUnlockRequest());
  }, UNLOCK_SEND_START_MS);

  // ── Seed ↔ Seed loops ────────────────────────────────────────────────────
  // Start after Marcus + Jaylen are online (minute 0) but give them a head
  // start so there are at least 2 guys to interact before the first fire.

  // Messages between seeds (first at 3 min, then every 2–6 min)
  setTimeout(() => {
    sendSeedToSeedMessage()
      .catch((err) => logger.error({ err }, "Seeder first seed-msg error"))
      .finally(() => scheduleNextSeedMessage());
  }, S2S_MSG_START_MS);

  // Profile views between seeds (first at 2 min, then every 5–10 min)
  setTimeout(() => {
    seedViewProfile()
      .catch((err) => logger.error({ err }, "Seeder first seed-view error"))
      .finally(() => scheduleNextSeedView());
  }, S2S_VIEW_START_MS);

  // Unlock requests between seeds (first at 5 min, then every 15–30 min)
  setTimeout(() => {
    sendSeedToSeedUnlockRequest()
      .catch((err) => logger.error({ err }, "Seeder first seed-unlock error"))
      .finally(() => scheduleNextSeedUnlockRequest());
  }, S2S_UNLOCK_START_MS);

  // Hot-stuff likes between seeds (first at 8 min, then every 15–25 min)
  setTimeout(() => {
    seedHotStuff()
      .catch((err) => logger.error({ err }, "Seeder first seed-hot error"))
      .finally(() => scheduleNextSeedHotStuff());
  }, S2S_HOT_START_MS);

  logger.info(
    {
      total: ROSTER.length,
      dripMins: 25, churnStartMins: 26,
      seed2real: "msgs 1.5–4 min, unlocks 10–20 min",
      seed2seed: "msgs 2–6 min, views 5–10 min, unlocks 15–30 min, likes 15–25 min",
    },
    "Seeder started — full social graph simulation active",
  );
}
