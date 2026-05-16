interface LastLocation {
  lat: number;
  lon: number;
  timestamp: number;
}

const lastLocations = new Map<string, LastLocation>();

const MAX_JUMP_MILES = 10;
const MIN_TRAVEL_TIME_MS = 2 * 60_000;

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function checkGpsJump(userId: string, lat: number, lon: number): boolean {
  const last = lastLocations.get(userId);
  const now = Date.now();

  if (last) {
    const dist = haversineMiles(last.lat, last.lon, lat, lon);
    const elapsed = now - last.timestamp;
    if (dist > MAX_JUMP_MILES && elapsed < MIN_TRAVEL_TIME_MS) {
      return true;
    }
  }

  lastLocations.set(userId, { lat, lon, timestamp: now });
  return false;
}

export function clearGpsHistory(userId: string) {
  lastLocations.delete(userId);
}

setInterval(() => {
  const cutoff = Date.now() - 10 * 60_000;
  for (const [id, loc] of lastLocations) {
    if (loc.timestamp < cutoff) lastLocations.delete(id);
  }
}, 5 * 60_000);
