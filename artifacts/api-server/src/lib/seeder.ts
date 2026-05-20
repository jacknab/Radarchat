import { db } from "@workspace/db";
import { profiles, messages, photoUnlockRequests, photoUnlocks } from "@workspace/db/schema";
import { eq, sql, not, like, and } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { logger } from "./logger";
import { sendToUser, isUserConnected } from "./ws";
import { sendExpoPush } from "./push";

const SEED_PREFIX = "seed_uptown_";

// Uptown Denver 80203 — each guy has a fixed lat/lon (never changes).
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
  lat: number;
  lon: number;
  publicPhotos: number[];
  privatePhotos: number[];
}[] = [
  {
    slug: "marcus", name: "Marcus", age: "29", position: "Top", bodyType: "Athletic",
    endowment: "Cut", lookingFor: "Right Now", hosting: "Can Host", cockSize: "7.5",
    into: "Oral,Anal,NSA", lat: 39.7415, lon: -104.9758,
    publicPhotos: [3], privatePhotos: [13, 23],
  },
  {
    slug: "jaylen", name: "Jaylen", age: "26", position: "Versatile", bodyType: "Muscular",
    endowment: "Uncut", lookingFor: "Tonight", hosting: "Host & Travel", cockSize: "8.0",
    into: "Oral,Anal,Kissing", lat: 39.7400, lon: -104.9780,
    publicPhotos: [7, 17], privatePhotos: [27],
  },
  {
    slug: "bryce", name: "Bryce", age: "33", position: "Bottom", bodyType: "Slim",
    endowment: "Cut", lookingFor: "Discreet", hosting: "Can Travel", cockSize: "6.0",
    into: "Oral,Rimming,Discreet", lat: 39.7430, lon: -104.9740,
    publicPhotos: [11], privatePhotos: [],
  },
  {
    slug: "cole", name: "Cole", age: "31", position: "Vers Top", bodyType: "Athletic",
    endowment: "Cut", lookingFor: "Regular", hosting: "Can Host", cockSize: "7.0",
    into: "Oral,Anal,Raw", lat: 39.7390, lon: -104.9720,
    publicPhotos: [15, 25], privatePhotos: [35],
  },
  {
    slug: "drew", name: "Drew", age: "24", position: "Bottom", bodyType: "Average",
    endowment: "Uncut", lookingFor: "Right Now", hosting: "No Host", cockSize: "5.5",
    into: "Oral,Kissing,JO / Mutual", lat: 39.7375, lon: -104.9765,
    publicPhotos: [19], privatePhotos: [29, 39],
  },
  {
    slug: "ryan", name: "Ryan", age: "38", position: "Top", bodyType: "Heavyset",
    endowment: "Cut", lookingFor: "Tonight", hosting: "Can Host", cockSize: "7.0",
    into: "Anal,NSA,Discreet", lat: 39.7420, lon: -104.9700,
    publicPhotos: [22, 32], privatePhotos: [],
  },
  {
    slug: "eli", name: "Eli", age: "27", position: "Versatile", bodyType: "Slim",
    endowment: "Uncut", lookingFor: "This Week", hosting: "Host & Travel", cockSize: "6.5",
    into: "Oral,Rimming,Anal", lat: 39.7398, lon: -104.9735,
    publicPhotos: [41], privatePhotos: [51],
  },
  {
    slug: "nate", name: "Nate", age: "35", position: "Side", bodyType: "Athletic",
    endowment: "Cut", lookingFor: "Regular", hosting: "Can Travel", cockSize: "6.0",
    into: "JO / Mutual,Oral,Kissing", lat: 39.7410, lon: -104.9770,
    publicPhotos: [44, 54], privatePhotos: [],
  },
  {
    slug: "travis", name: "Travis", age: "30", position: "Vers Bottom", bodyType: "Stocky",
    endowment: "Cut", lookingFor: "Right Now", hosting: "Can Host", cockSize: "6.5",
    into: "Anal,Kink,Raw", lat: 39.7385, lon: -104.9750,
    publicPhotos: [48], privatePhotos: [58, 68],
  },
  {
    slug: "derek", name: "Derek", age: "42", position: "Top", bodyType: "Muscular",
    endowment: "Uncut", lookingFor: "Discreet", hosting: "No Host", cockSize: "8.0",
    into: "Oral,Anal,Discreet", lat: 39.7435, lon: -104.9755,
    publicPhotos: [53], privatePhotos: [],
  },
  {
    slug: "kyle", name: "Kyle", age: "23", position: "Bottom", bodyType: "Slim",
    endowment: "Cut", lookingFor: "Tonight", hosting: "Host & Travel", cockSize: "5.5",
    into: "Oral,Kissing,Regular", lat: 39.7368, lon: -104.9730,
    publicPhotos: [56, 66], privatePhotos: [36],
  },
  {
    slug: "sean", name: "Sean", age: "45", position: "Versatile", bodyType: "Average",
    endowment: "Cut", lookingFor: "Regular", hosting: "Can Host", cockSize: "7.0",
    into: "Oral,Anal,Outdoors", lat: 39.7395, lon: -104.9708,
    publicPhotos: [60], privatePhotos: [],
  },
  {
    slug: "brandon", name: "Brandon", age: "28", position: "Top", bodyType: "Athletic",
    endowment: "Uncut", lookingFor: "Right Now", hosting: "Can Host", cockSize: "7.5",
    into: "Raw,Anal,NSA", lat: 39.7422, lon: -104.9742,
    publicPhotos: [62, 2], privatePhotos: [12],
  },
  {
    slug: "adam", name: "Adam", age: "36", position: "Vers Top", bodyType: "Muscular",
    endowment: "Cut", lookingFor: "This Week", hosting: "Can Travel", cockSize: "7.0",
    into: "Kink,Anal,Toys", lat: 39.7378, lon: -104.9715,
    publicPhotos: [64], privatePhotos: [4, 14],
  },
  {
    slug: "chris", name: "Chris", age: "32", position: "Bottom", bodyType: "Average",
    endowment: "Uncut", lookingFor: "Tonight", hosting: "No Host", cockSize: "6.0",
    into: "Oral,Rimming,Kissing", lat: 39.7440, lon: -104.9728,
    publicPhotos: [9, 18], privatePhotos: [],
  },
  {
    slug: "mike", name: "Mike", age: "40", position: "Top", bodyType: "Heavyset",
    endowment: "Cut", lookingFor: "Discreet", hosting: "Can Host", cockSize: "7.5",
    into: "Discreet,NSA,Anal", lat: 39.7362, lon: -104.9758,
    publicPhotos: [20], privatePhotos: [30, 50],
  },
];

// ─── Initial drip schedule ────────────────────────────────────────────────────
// Each inner array = roster indices that come online at that minute mark.
// All 16 guys are online by ~25 minutes.
const DRIP_MINUTES: number[][] = [
  [0, 1],   // Marcus, Jaylen  — minute 0
  [2],      // Bryce            — minute 2
  [3, 4],   // Cole, Drew       — minute 4  (delay stored as minute index, see below)
  [5],      // Ryan             — minute 7
  [6, 7],   // Eli, Nate        — minute 9
  [8],      // Travis           — minute 12
  [9, 10],  // Derek, Kyle      — minute 14
  [11],     // Sean             — minute 17
  [12, 13], // Brandon, Adam    — minute 19
  [14],     // Chris            — minute 22
  [15],     // Mike             — minute 25
];

// Actual delay in minutes for each batch
const DRIP_DELAY_MINS = [0, 2, 4, 7, 9, 12, 14, 17, 19, 22, 25];

// ─── Steady-state churn (runs forever after initial drip) ────────────────────
// Every CHURN_INTERVAL_MS, randomly drop 1-3 guys offline for OFFLINE_DURATION_MS,
// then bring them back. Keeps activity realistic during multi-hour testing.
const CHURN_INTERVAL_MS  = 4 * 60_000;   // every 4 minutes, churn someone
const OFFLINE_DURATION_MS = 6 * 60_000;  // guys stay offline for ~6 minutes
const KEEPALIVE_INTERVAL_MS = 60_000;    // refresh lastSeen every 60s

// Track which slugs are currently online (post-drip)
const onlineSlugs = new Set<string>();

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

async function bringOnline(rosterIdx: number) {
  const guy = ROSTER[rosterIdx];
  if (!guy) return;
  const id = `${SEED_PREFIX}${guy.slug}`;
  const now = Date.now();
  const photos = buildPhotos(guy.publicPhotos, guy.privatePhotos);

  await db
    .insert(profiles)
    .values({
      id, name: guy.name, age: guy.age, position: guy.position,
      bodyType: guy.bodyType, endowment: guy.endowment, lookingFor: guy.lookingFor,
      hosting: guy.hosting, cockSize: guy.cockSize, into: guy.into, photos,
      isOnline: true, isLive: true, isShadowBanned: false,
      lastSeen: now, latitude: guy.lat, longitude: guy.lon, createdAt: now,
    })
    .onConflictDoUpdate({
      target: profiles.id,
      set: {
        isOnline: true, isLive: true, lastSeen: now,
        // location stays fixed — never update lat/lon
        latitude: guy.lat, longitude: guy.lon,
      },
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
  const guy = ROSTER.find((g) => g.slug === slug);
  if (!guy) return;
  const now = Date.now();
  await db
    .update(profiles)
    .set({ isOnline: true, isLive: true, lastSeen: now, latitude: guy.lat, longitude: guy.lon })
    .where(eq(profiles.id, `${SEED_PREFIX}${slug}`));
  onlineSlugs.add(slug);
  logger.info({ slug }, "Seed guy came back online");
}

async function keepalive() {
  const now = Date.now();
  // Only touch guys currently flagged online so we don't resurface offline ones
  await db
    .update(profiles)
    .set({ lastSeen: now })
    .where(sql`${profiles.id} LIKE ${"seed_uptown_%"} AND ${profiles.isLive} = true`);
}

// ─── Message simulation ───────────────────────────────────────────────────────
// Each seeded guy has his own personality — messages feel distinct, not copy-paste.
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

const MSG_MIN_INTERVAL_MS = 90_000;        // earliest next message after one fires (~1.5 min)
const MSG_MAX_INTERVAL_MS = 4 * 60_000;   // latest (~4 min)
const MSG_START_DELAY_MS  = 20_000;        // first message fires 20s after server start

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
  // Need at least one real user and at least one seeded guy online
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
      .finally(() => scheduleNextMessage()); // always schedule the next one
  }, delay);
}

// ─── Photo unlock request simulation ─────────────────────────────────────────
const UNLOCK_RESPOND_INTERVAL_MS = 90_000;  // check every 90s for requests on seeded profiles
const UNLOCK_SEND_MIN_MS  = 10 * 60_000;   // min gap between seeder-sent requests
const UNLOCK_SEND_MAX_MS  = 20 * 60_000;   // max gap
const UNLOCK_SEND_START_MS = 60_000;        // first unlock request after 1 min

// 60% chance a seeded guy accepts an incoming request; 40% he silently ignores it
const ACCEPT_CHANCE = 0.6;

async function respondToUnlockRequests() {
  // Find pending requests where the target IS a seeded profile (real user → seed)
  const pending = await db
    .select({ requesterId: photoUnlockRequests.requesterId, targetId: photoUnlockRequests.targetId })
    .from(photoUnlockRequests)
    .where(like(photoUnlockRequests.targetId, `${SEED_PREFIX}%`));

  for (const req of pending) {
    if (Math.random() < ACCEPT_CHANCE) {
      // Accept after a realistic 30s–3.5min pause
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
      // Silently ignore — remove from queue after 5–10 min so it doesn't linger
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

// Seeded guy proactively sends an unlock request TO the real user
async function sendRandomUnlockRequest() {
  if (onlineSlugs.size === 0) return;
  const realIds = await getRealUserIds();
  if (realIds.length === 0) return;

  // Only guys who actually have private photos can send an unlock request
  const eligibleSlugs = Array.from(onlineSlugs).filter((s) => {
    const guy = ROSTER.find((g) => g.slug === s);
    return guy && guy.privatePhotos.length > 0;
  });
  if (eligibleSlugs.length === 0) return;

  const recipientId = realIds[Math.floor(Math.random() * realIds.length)]!;
  const senderSlug  = eligibleSlugs[Math.floor(Math.random() * eligibleSlugs.length)]!;
  const senderId    = `${SEED_PREFIX}${senderSlug}`;
  const senderGuy   = ROSTER.find((g) => g.slug === senderSlug)!;

  // Skip if already requested or already granted
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

  // Real-time WS delivery
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

  // Push notification if user is not connected via WebSocket
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

// ─── Churn loop (runs indefinitely) ──────────────────────────────────────────
function startChurn() {
  setInterval(() => {
    if (onlineSlugs.size === 0) return;

    // Drop 1–3 online guys offline
    const dropCount = Math.floor(Math.random() * 3) + 1;
    const toDrop = pickRandom(Array.from(onlineSlugs), Math.min(dropCount, onlineSlugs.size));

    for (const slug of toDrop) {
      takeOffline(slug).catch((err) => logger.error({ err, slug }, "Churn takeOffline error"));

      // Bring them back after OFFLINE_DURATION ± random jitter (up to +3 min)
      const jitter = Math.random() * 3 * 60_000;
      setTimeout(() => {
        bringSlugOnline(slug).catch((err) =>
          logger.error({ err, slug }, "Churn bringOnline error"),
        );
      }, OFFLINE_DURATION_MS + jitter);
    }
  }, CHURN_INTERVAL_MS);
}

// ─── Entry point ─────────────────────────────────────────────────────────────
export function startSeeder() {
  // Schedule initial drip — all 16 guys online by minute 25
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

  // Start churn loop after all guys are online (minute 26)
  setTimeout(() => {
    startChurn();
    logger.info("Seeder entered steady-state churn — running indefinitely");
  }, 26 * 60_000);

  // Keepalive every 60s — runs from the start so early guys don't time out
  setInterval(() => {
    keepalive().catch((err) => logger.error({ err }, "Seeder keepalive error"));
  }, KEEPALIVE_INTERVAL_MS);

  // Message simulation — first message after 5 min, then every 3–8 min forever
  setTimeout(() => {
    sendSimulatedMessage()
      .catch((err) => logger.error({ err }, "Seeder first message error"))
      .finally(() => scheduleNextMessage());
  }, MSG_START_DELAY_MS);

  // Unlock request simulation — poll every 90s for responses to real user requests
  setInterval(() => {
    respondToUnlockRequests().catch((err) => logger.error({ err }, "Seeder respondToUnlock error"));
  }, UNLOCK_RESPOND_INTERVAL_MS);

  // Seeded guys proactively send unlock requests to real users — first after 8 min
  setTimeout(() => {
    sendRandomUnlockRequest()
      .catch((err) => logger.error({ err }, "Seeder first unlock request error"))
      .finally(() => scheduleNextUnlockRequest());
  }, UNLOCK_SEND_START_MS);

  logger.info(
    { total: ROSTER.length, dripMins: 25, churnStartMins: 26, firstMsgSecs: 20, firstUnlockSecs: 60 },
    "Seeder started — drip, churn, messages every 1.5–4 min, unlock requests every 10–20 min",
  );
}
