import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  bigint,
  boolean,
  doublePrecision,
  jsonb,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";

export type NotificationType = "profile_view" | "liked_you";

export type ProfilePhoto = { id: string; uri: string; thumbnailUri?: string; isLocked: boolean };

export const profiles = pgTable(
  "profiles",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull().default(""),
    age: text("age").notNull().default(""),
    bio: text("bio").notNull().default(""),
    position: text("position").notNull().default(""),
    bodyType: text("body_type").notNull().default(""),
    lookingFor: text("looking_for").notNull().default(""),
    photos: jsonb("photos")
      .$type<ProfilePhoto[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    isOnline: boolean("is_online").notNull().default(true),
    isLive: boolean("is_live").notNull().default(true),
    isShadowBanned: boolean("is_shadow_banned").notNull().default(false),
    lastSeen: bigint("last_seen", { mode: "number" }).notNull().default(0),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    createdAt: bigint("created_at", { mode: "number" }).notNull().default(0),
    pushToken: text("push_token"),
    cockSize: text("cock_size"),
    hosting: text("hosting").notNull().default(""),
  },
  (t) => ({
    locIdx: index("profiles_loc_idx").on(t.latitude, t.longitude),
    liveIdx: index("profiles_live_idx").on(t.isLive, t.lastSeen),
  }),
);

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),
    senderId: text("sender_id").notNull(),
    recipientId: text("recipient_id").notNull(),
    text: text("text").notNull(),
    timestamp: bigint("timestamp", { mode: "number" }).notNull(),
    read: boolean("read").notNull().default(false),
  },
  (t) => ({
    pairIdx: index("messages_pair_idx").on(t.senderId, t.recipientId, t.timestamp),
    recIdx: index("messages_recipient_idx").on(t.recipientId, t.timestamp),
  }),
);

export const blocks = pgTable(
  "blocks",
  {
    blockerId: text("blocker_id").notNull(),
    blockedId: text("blocked_id").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.blockerId, t.blockedId] }),
  }),
);

export const hotStuff = pgTable(
  "hot_stuff",
  {
    ownerId: text("owner_id").notNull(),
    targetId: text("target_id").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.ownerId, t.targetId] }),
  }),
);

export const archived = pgTable(
  "archived",
  {
    ownerId: text("owner_id").notNull(),
    targetId: text("target_id").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.ownerId, t.targetId] }),
  }),
);

export const photoUnlocks = pgTable(
  "photo_unlocks",
  {
    granterId: text("granter_id").notNull(),
    granteeId: text("grantee_id").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.granterId, t.granteeId] }),
  }),
);

export const photoUnlockRequests = pgTable(
  "photo_unlock_requests",
  {
    requesterId: text("requester_id").notNull(),
    targetId: text("target_id").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.requesterId, t.targetId] }),
    targetIdx: index("photo_unlock_requests_target_idx").on(t.targetId),
  }),
);

export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    recipientId: text("recipient_id").notNull(),
    senderId: text("sender_id").notNull(),
    type: text("type").$type<NotificationType>().notNull(),
    senderName: text("sender_name").notNull().default(""),
    senderPhotoUri: text("sender_photo_uri"),
    read: boolean("read").notNull().default(false),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => ({
    recipientIdx: index("notifications_recipient_idx").on(t.recipientId, t.createdAt),
  }),
);

export type Profile = typeof profiles.$inferSelect;
export type InsertProfile = typeof profiles.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;
