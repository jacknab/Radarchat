import { db } from "@workspace/db";
import { profiles } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { logger } from "./logger";

const SEED_PREFIX = "seed_";
const POOL_SIZE = 20;
const ACTIVE_COUNT = 8;
const TICK_INTERVAL_MS = 2 * 60_000;
const SCATTER_MILES = 2;
const MILES_PER_DEG_LAT = 69.0;
const DEFAULT_LAT = 39.7392;
const DEFAULT_LON = -104.9903;

const NAMES = ["Alex", "Jordan", "Tyler", "Casey", "Morgan", "Jamie", "Quinn", "Blake", "Reese", "Dakota", "Avery", "River", "Drew", "Cameron", "Kyle", "Shane", "Cole", "Ryan", "Derek", "Evan"];
const POSITIONS = ["Top", "Bottom", "Versatile", "Vers Top", "Vers Bottom", "Side"];
const BODY_TYPES = ["Athletic", "Slim", "Average", "Muscular", "Stocky", "Heavyset"];
const ENDOWMENTS = ["Cut", "Uncut"];
const LOOKING_FORS = ["Right Now", "Tonight", "This Week", "Regular", "Discreet"];
const HOSTING_OPTIONS = ["Can Host", "Can Travel", "Host & Travel", "No Host"];
const AGES = ["22", "24", "26", "28", "30", "32", "34", "36", "38", "40", "42", "45", "48"];
const COCK_SIZES = ["5.0", "5.5", "6.0", "6.5", "7.0", "7.5", "8.0"];
const INTO_OPTIONS = [
  "Oral,Kissing,NSA",
  "Oral,Rimming,Discreet",
  "Anal,Raw,NSA",
  "Oral,JO / Mutual,Discreet",
  "Kink,Raw,Regular",
  "Oral,Anal,Kissing",
  "Rimming,Anal,Outdoors",
  "NSA,Discreet,JO / Mutual",
  "Oral,Kissing,Regular",
  "Anal,Kink,Toys",
];

// Pre-defined stable portrait URLs from randomuser.me CDN
const MALE_PHOTO_INDICES = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70];
const usedPhotoIndices = new Set<number>();

function pickPhotoIndex(): number {
  if (usedPhotoIndices.size >= MALE_PHOTO_INDICES.length) usedPhotoIndices.clear();
  let idx: number;
  do { idx = MALE_PHOTO_INDICES[Math.floor(Math.random() * MALE_PHOTO_INDICES.length)]!; }
  while (usedPhotoIndices.has(idx));
  usedPhotoIndices.add(idx);
  return idx;
}

function makeSeedPhotos(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const n = pickPhotoIndex();
    const uri = `https://randomuser.me/api/portraits/men/${n}.jpg`;
    return { id: `sp_${n}`, uri, thumbnailUri: uri, isLocked: i === 1 };
  });
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function scatter(centerLat: number, centerLon: number): { lat: number; lon: number } {
  const latDelta = (Math.random() - 0.5) * 2 * (SCATTER_MILES / MILES_PER_DEG_LAT);
  const lonDelta =
    (Math.random() - 0.5) *
    2 *
    (SCATTER_MILES / (MILES_PER_DEG_LAT * Math.cos((centerLat * Math.PI) / 180)));
  return { lat: centerLat + latDelta, lon: centerLon + lonDelta };
}

async function getCenter(): Promise<{ lat: number; lon: number }> {
  const realUsers = await db
    .select({ latitude: profiles.latitude, longitude: profiles.longitude })
    .from(profiles)
    .where(sql`${profiles.id} NOT LIKE ${SEED_PREFIX + "%"}`);

  const valid = realUsers.filter((u) => u.latitude != null && u.longitude != null);
  if (!valid.length) return { lat: DEFAULT_LAT, lon: DEFAULT_LON };

  const lat = valid.reduce((sum, u) => sum + u.latitude!, 0) / valid.length;
  const lon = valid.reduce((sum, u) => sum + u.longitude!, 0) / valid.length;
  return { lat, lon };
}

async function tick() {
  const now = Date.now();
  const center = await getCenter();

  const seeded = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(sql`${profiles.id} LIKE ${SEED_PREFIX + "%"}`);

  const missing = POOL_SIZE - seeded.length;
  const createdIds: string[] = [];

  for (let i = 0; i < missing; i++) {
    const id = `${SEED_PREFIX}${randomUUID()}`;
    const { lat, lon } = scatter(center.lat, center.lon);
    await db
      .insert(profiles)
      .values({
        id,
        name: pick(NAMES),
        age: pick(AGES),
        position: pick(POSITIONS),
        bodyType: pick(BODY_TYPES),
        endowment: pick(ENDOWMENTS),
        lookingFor: pick(LOOKING_FORS),
        hosting: pick(HOSTING_OPTIONS),
        cockSize: pick(COCK_SIZES),
        into: pick(INTO_OPTIONS),
        photos: makeSeedPhotos(Math.random() < 0.4 ? 2 : 1),
        isOnline: true,
        isLive: true,
        isShadowBanned: false,
        lastSeen: now,
        latitude: lat,
        longitude: lon,
        createdAt: now,
      })
      .onConflictDoNothing();
    createdIds.push(id);
  }

  const allIds = [...seeded.map((s) => s.id), ...createdIds];
  const shuffled = allIds.sort(() => Math.random() - 0.5);
  const toRefresh = shuffled.slice(0, Math.min(ACTIVE_COUNT, shuffled.length));

  for (const id of toRefresh) {
    const { lat, lon } = scatter(center.lat, center.lon);
    await db
      .update(profiles)
      .set({ lastSeen: now, isLive: true, isOnline: true, latitude: lat, longitude: lon })
      .where(eq(profiles.id, id));
  }

  logger.info(
    { refreshed: toRefresh.length, created: createdIds.length, pool: allIds.length },
    "Seeder tick",
  );
}

export function startSeeder() {
  tick().catch((err) => logger.error({ err }, "Seeder initial tick error"));
  setInterval(() => {
    tick().catch((err) => logger.error({ err }, "Seeder tick error"));
  }, TICK_INTERVAL_MS);
}
