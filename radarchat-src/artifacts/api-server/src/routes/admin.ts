import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { profiles } from "@workspace/db/schema";

const router: IRouter = Router();

function requireAdminSecret(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    res.status(503).json({ error: "Admin access not configured. Set the ADMIN_SECRET environment variable." });
    return;
  }
  const provided = (req.header("x-admin-secret") || "").trim();
  if (!provided || provided !== secret) {
    res.status(401).json({ error: "Invalid or missing admin secret." });
    return;
  }
  next();
}

// POST /api/admin/shadow-ban/:userId  — ban a user (hide from feed, block messages)
router.post("/admin/shadow-ban/:userId", requireAdminSecret, async (req, res) => {
  const userId = String(req.params.userId);
  const [row] = await db
    .update(profiles)
    .set({ isShadowBanned: true, isLive: false })
    .where(eq(profiles.id, userId))
    .returning({ id: profiles.id, name: profiles.name, isShadowBanned: profiles.isShadowBanned });

  if (!row) {
    res.status(404).json({ error: "User not found." });
    return;
  }
  res.json({ ok: true, userId: row.id, name: row.name, isShadowBanned: row.isShadowBanned });
});

// DELETE /api/admin/shadow-ban/:userId  — lift the ban
router.delete("/admin/shadow-ban/:userId", requireAdminSecret, async (req, res) => {
  const userId = String(req.params.userId);
  const [row] = await db
    .update(profiles)
    .set({ isShadowBanned: false })
    .where(eq(profiles.id, userId))
    .returning({ id: profiles.id, name: profiles.name, isShadowBanned: profiles.isShadowBanned });

  if (!row) {
    res.status(404).json({ error: "User not found." });
    return;
  }
  res.json({ ok: true, userId: row.id, name: row.name, isShadowBanned: row.isShadowBanned });
});

// GET /api/admin/users  — list all profiles (id, name, isShadowBanned, isLive, lastSeen)
router.get("/admin/users", requireAdminSecret, async (_req, res) => {
  const rows = await db
    .select({
      id: profiles.id,
      name: profiles.name,
      age: profiles.age,
      isOnline: profiles.isOnline,
      isLive: profiles.isLive,
      isShadowBanned: profiles.isShadowBanned,
      lastSeen: profiles.lastSeen,
      createdAt: profiles.createdAt,
      latitude: profiles.latitude,
      longitude: profiles.longitude,
    })
    .from(profiles)
    .orderBy(profiles.lastSeen);

  const now = Date.now();
  const ONLINE_WINDOW_MS = 5 * 60_000;
  res.json(
    rows.map((r) => ({
      ...r,
      isOnline: r.isOnline && now - r.lastSeen < ONLINE_WINDOW_MS,
    }))
  );
});

export default router;
