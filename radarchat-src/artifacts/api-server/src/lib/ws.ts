import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { profiles } from "@workspace/db/schema";

const clients = new Map<string, Set<WebSocket>>();

const PING_INTERVAL_MS = 25_000;

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    if (url.pathname !== "/api/ws") {
      socket.destroy();
      return;
    }
    const token = url.searchParams.get("token");
    if (!token) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      if (!clients.has(token)) clients.set(token, new Set());
      clients.get(token)!.add(ws);

      // Mark online in DB when first socket for this user connects
      if (clients.get(token)!.size === 1) {
        db.update(profiles)
          .set({ isOnline: true, lastSeen: Date.now() })
          .where(eq(profiles.id, token))
          .catch(() => {});
      }

      // Track whether this socket is still alive via ping/pong
      (ws as any)._alive = true;
      ws.on("pong", () => { (ws as any)._alive = true; });

      ws.on("close", () => {
        clients.get(token)?.delete(ws);
        if ((clients.get(token)?.size ?? 0) === 0) {
          clients.delete(token);
          // Mark offline in DB when last socket for this user closes
          db.update(profiles)
            .set({ isOnline: false })
            .where(eq(profiles.id, token))
            .catch(() => {});
        }
      });

      ws.on("error", () => ws.terminate());

      ws.send(JSON.stringify({ type: "connected" }));
    });
  });

  // Ping all clients every interval; terminate any that didn't respond
  setInterval(() => {
    for (const [token, sockets] of clients) {
      for (const ws of sockets) {
        if (!(ws as any)._alive) {
          ws.terminate();
          continue;
        }
        (ws as any)._alive = false;
        ws.ping();
      }
      // Clean up empty sets
      if (sockets.size === 0) clients.delete(token);
    }
  }, PING_INTERVAL_MS);

  return wss;
}

export function sendToUser(userId: string, data: object): boolean {
  const userClients = clients.get(userId);
  if (!userClients || userClients.size === 0) return false;
  const msg = JSON.stringify(data);
  for (const ws of userClients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
  return true;
}

export function isUserConnected(userId: string): boolean {
  const userClients = clients.get(userId);
  return !!(userClients && userClients.size > 0);
}
