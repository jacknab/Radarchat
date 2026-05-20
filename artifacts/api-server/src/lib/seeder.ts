import { db } from "@workspace/db";
import { profiles } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { logger } from "./logger";

const SEED_PREFIX = "seed_uptown_";

// Uptown Denver 80203 — each guy has a fixed lat/lon so they always appear
// in the exact same spot on the radar.
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
  // public photo indices from randomuser.me/portraits/men/N.jpg
  publicPhotos: number[];
  // private/locked photo indices — empty means no private photos
  privatePhotos: number[];
}[] = [
  {
    slug: "marcus",
    name: "Marcus",
    age: "29",
    position: "Top",
    bodyType: "Athletic",
    endowment: "Cut",
    lookingFor: "Right Now",
    hosting: "Can Host",
    cockSize: "7.5",
    into: "Oral,Anal,NSA",
    lat: 39.7415, lon: -104.9758,
    publicPhotos: [3],
    privatePhotos: [13, 23],
  },
  {
    slug: "jaylen",
    name: "Jaylen",
    age: "26",
    position: "Versatile",
    bodyType: "Muscular",
    endowment: "Uncut",
    lookingFor: "Tonight",
    hosting: "Host & Travel",
    cockSize: "8.0",
    into: "Oral,Anal,Kissing",
    lat: 39.7400, lon: -104.9780,
    publicPhotos: [7, 17],
    privatePhotos: [27],
  },
  {
    slug: "bryce",
    name: "Bryce",
    age: "33",
    position: "Bottom",
    bodyType: "Slim",
    endowment: "Cut",
    lookingFor: "Discreet",
    hosting: "Can Travel",
    cockSize: "6.0",
    into: "Oral,Rimming,Discreet",
    lat: 39.7430, lon: -104.9740,
    publicPhotos: [11],
    privatePhotos: [],
  },
  {
    slug: "cole",
    name: "Cole",
    age: "31",
    position: "Vers Top",
    bodyType: "Athletic",
    endowment: "Cut",
    lookingFor: "Regular",
    hosting: "Can Host",
    cockSize: "7.0",
    into: "Oral,Anal,Raw",
    lat: 39.7390, lon: -104.9720,
    publicPhotos: [15, 25],
    privatePhotos: [35],
  },
  {
    slug: "drew",
    name: "Drew",
    age: "24",
    position: "Bottom",
    bodyType: "Average",
    endowment: "Uncut",
    lookingFor: "Right Now",
    hosting: "No Host",
    cockSize: "5.5",
    into: "Oral,Kissing,JO / Mutual",
    lat: 39.7375, lon: -104.9765,
    publicPhotos: [19],
    privatePhotos: [29, 39],
  },
  {
    slug: "ryan",
    name: "Ryan",
    age: "38",
    position: "Top",
    bodyType: "Heavyset",
    endowment: "Cut",
    lookingFor: "Tonight",
    hosting: "Can Host",
    cockSize: "7.0",
    into: "Anal,NSA,Discreet",
    lat: 39.7420, lon: -104.9700,
    publicPhotos: [22, 32],
    privatePhotos: [],
  },
  {
    slug: "eli",
    name: "Eli",
    age: "27",
    position: "Versatile",
    bodyType: "Slim",
    endowment: "Uncut",
    lookingFor: "This Week",
    hosting: "Host & Travel",
    cockSize: "6.5",
    into: "Oral,Rimming,Anal",
    lat: 39.7398, lon: -104.9735,
    publicPhotos: [41],
    privatePhotos: [51],
  },
  {
    slug: "nate",
    name: "Nate",
    age: "35",
    position: "Side",
    bodyType: "Athletic",
    endowment: "Cut",
    lookingFor: "Regular",
    hosting: "Can Travel",
    cockSize: "6.0",
    into: "JO / Mutual,Oral,Kissing",
    lat: 39.7410, lon: -104.9770,
    publicPhotos: [44, 54],
    privatePhotos: [],
  },
  {
    slug: "travis",
    name: "Travis",
    age: "30",
    position: "Vers Bottom",
    bodyType: "Stocky",
    endowment: "Cut",
    lookingFor: "Right Now",
    hosting: "Can Host",
    cockSize: "6.5",
    into: "Anal,Kink,Raw",
    lat: 39.7385, lon: -104.9750,
    publicPhotos: [48],
    privatePhotos: [58, 68],
  },
  {
    slug: "derek",
    name: "Derek",
    age: "42",
    position: "Top",
    bodyType: "Muscular",
    endowment: "Uncut",
    lookingFor: "Discreet",
    hosting: "No Host",
    cockSize: "8.0",
    into: "Oral,Anal,Discreet",
    lat: 39.7435, lon: -104.9755,
    publicPhotos: [53],
    privatePhotos: [],
  },
  {
    slug: "kyle",
    name: "Kyle",
    age: "23",
    position: "Bottom",
    bodyType: "Slim",
    endowment: "Cut",
    lookingFor: "Tonight",
    hosting: "Host & Travel",
    cockSize: "5.5",
    into: "Oral,Kissing,Regular",
    lat: 39.7368, lon: -104.9730,
    publicPhotos: [56, 66],
    privatePhotos: [36],
  },
  {
    slug: "sean",
    name: "Sean",
    age: "45",
    position: "Versatile",
    bodyType: "Average",
    endowment: "Cut",
    lookingFor: "Regular",
    hosting: "Can Host",
    cockSize: "7.0",
    into: "Oral,Anal,Outdoors",
    lat: 39.7395, lon: -104.9708,
    publicPhotos: [60],
    privatePhotos: [],
  },
  {
    slug: "brandon",
    name: "Brandon",
    age: "28",
    position: "Top",
    bodyType: "Athletic",
    endowment: "Uncut",
    lookingFor: "Right Now",
    hosting: "Can Host",
    cockSize: "7.5",
    into: "Raw,Anal,NSA",
    lat: 39.7422, lon: -104.9742,
    publicPhotos: [62, 2],
    privatePhotos: [12],
  },
  {
    slug: "adam",
    name: "Adam",
    age: "36",
    position: "Vers Top",
    bodyType: "Muscular",
    endowment: "Cut",
    lookingFor: "This Week",
    hosting: "Can Travel",
    cockSize: "7.0",
    into: "Kink,Anal,Toys",
    lat: 39.7378, lon: -104.9715,
    publicPhotos: [64],
    privatePhotos: [4, 14],
  },
  {
    slug: "chris",
    name: "Chris",
    age: "32",
    position: "Bottom",
    bodyType: "Average",
    endowment: "Uncut",
    lookingFor: "Tonight",
    hosting: "No Host",
    cockSize: "6.0",
    into: "Oral,Rimming,Kissing",
    lat: 39.7440, lon: -104.9728,
    publicPhotos: [9, 18],
    privatePhotos: [],
  },
  {
    slug: "mike",
    name: "Mike",
    age: "40",
    position: "Top",
    bodyType: "Heavyset",
    endowment: "Cut",
    lookingFor: "Discreet",
    hosting: "Can Host",
    cockSize: "7.5",
    into: "Discreet,NSA,Anal",
    lat: 39.7362, lon: -104.9758,
    publicPhotos: [20],
    privatePhotos: [30, 50],
  },
];

// Drip schedule: each entry is the delay in MINUTES after server start
// when that roster index comes online. Spread 16 guys over ~30 mins, 1-2 at a time.
const DRIP_SCHEDULE: number[][] = [
  [0, 1],     // guys 0,1  come online immediately
  [2],        // guy  2    at 2 min
  [4, 5],     // guys 3,4  at 4 min
  [7],        // guy  5    at 7 min
  [9, 10],    // guys 6,7  at 9 min
  [12],       // guy  8    at 12 min
  [14, 15],   // guys 9,10 at 14 min
  [17],       // guy  11   at 17 min
  [19, 20],   // guys 12,13 at 19 min
  [22],       // guy  14   at 22 min
  [25, 26],   // guys 15 (index 15 only, wraps) at 25 min — all 16 online
];

const KEEPALIVE_INTERVAL_MS = 60_000; // refresh lastSeen every 60s once online

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

async function bringOnline(idx: number) {
  const guy = ROSTER[idx];
  if (!guy) return;

  const id = `${SEED_PREFIX}${guy.slug}`;
  const now = Date.now();
  const photos = buildPhotos(guy.publicPhotos, guy.privatePhotos);

  // Upsert — create if new, bring online if exists
  await db
    .insert(profiles)
    .values({
      id,
      name: guy.name,
      age: guy.age,
      position: guy.position,
      bodyType: guy.bodyType,
      endowment: guy.endowment,
      lookingFor: guy.lookingFor,
      hosting: guy.hosting,
      cockSize: guy.cockSize,
      into: guy.into,
      photos,
      isOnline: true,
      isLive: true,
      isShadowBanned: false,
      lastSeen: now,
      latitude: guy.lat,
      longitude: guy.lon,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: profiles.id,
      set: {
        isOnline: true,
        isLive: true,
        lastSeen: now,
        // keep lat/lon fixed — do NOT update location on reconnect
        latitude: guy.lat,
        longitude: guy.lon,
      },
    });

  logger.info({ name: guy.name, id }, "Seed guy came online");
}

async function keepalive() {
  const now = Date.now();
  // Just refresh lastSeen so they stay visible; locations stay fixed
  await db
    .update(profiles)
    .set({ lastSeen: now, isOnline: true, isLive: true })
    .where(sql`${profiles.id} LIKE ${"seed_uptown_%"}`);
}

export function startSeeder() {
  // Flatten drip schedule into a list of { delayMs, rosterIndex } entries
  let rosterIdx = 0;
  for (const batch of DRIP_SCHEDULE) {
    for (const delayMins of batch) {
      const capturedIdx = rosterIdx;
      setTimeout(
        () => {
          bringOnline(capturedIdx).catch((err) =>
            logger.error({ err, idx: capturedIdx }, "Seeder bringOnline error"),
          );
        },
        delayMins * 60_000,
      );
      rosterIdx++;
      if (rosterIdx >= ROSTER.length) break;
    }
    if (rosterIdx >= ROSTER.length) break;
  }

  // Keepalive: refresh lastSeen every minute so guys don't time out off the radar
  setInterval(() => {
    keepalive().catch((err) => logger.error({ err }, "Seeder keepalive error"));
  }, KEEPALIVE_INTERVAL_MS);

  logger.info(
    { total: Math.min(rosterIdx, ROSTER.length), durationMins: 25 },
    "Seeder started — guys will trickle online over ~25 minutes",
  );
}
