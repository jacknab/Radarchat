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
const DEFAULT_LAT = 37.7749;
const DEFAULT_LON = -122.4194;

const NAMES = ["Alex", "Jordan", "Tyler", "Casey", "Morgan", "Jamie", "Quinn", "Blake", "Reese", "Dakota", "Avery", "River", "Drew", "Cameron", "Kyle", "Shane", "Cole", "Ryan", "Derek", "Evan"];
const POSITIONS = ["Top", "Bottom", "Versatile", "Vers Top", "Vers Bottom", "Side"];
const BODY_TYPES = ["Athletic", "Slim", "Average", "Muscular", "Stocky", "Heavyset"];
const ENDOWMENTS = ["Cut", "Uncut"];
const LOOKING_FORS = ["Right Now", "Tonight", "This Week", "Regular", "Discreet"];
const HOSTING_OPTIONS = ["Can Host", "Can Travel", "Host & Travel", "No Host"];
const AGES = ["22", "24", "26", "28", "30", "32", "34", "36", "38", "40", "42", "45", "48"];
const COCK_SIZES = ["5.0", "5.5", "6.0", "6.5", "7.0", "7.5", "8.0"];
const INTO_OPTIONS = [
  "Masc guys only. Love oral, good at it. DDF and on PrEP.",
  "Into kissing, JO, oral. Happy to host. Discreet please.",
  "Raw bottom. Love a thick top. Can travel or host.",
  "Versatile. Into hairy guys. Casual and NSA only.",
  "Top. Looking for a regular. Clean, fit, serious only.",
  "Oral, manual, light kink. No strings. Free most evenings.",
  "Hung bottom. Prefer bigger tops. Into bears and daddies.",
  "Verse. Into guys my age or older. Discreet and laid back.",
];

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
        photos: [],
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
