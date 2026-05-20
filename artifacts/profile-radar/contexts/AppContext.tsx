import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode, useRef, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { Platform, AppState, AppStateStatus } from "react-native";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { api, uploadPhoto, API_BASE } from "@/lib/api";
import { playRadarPing } from "@/lib/radar-sound";
import { playMessageAlert } from "@/lib/message-sound";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export interface Photo {
  id: string;
  uri: string;
  thumbnailUri?: string;
  isLocked: boolean;
}

export interface UserProfile {
  id: string;
  name: string;
  age: string;
  position: string;
  bodyType: string;
  endowment?: string;
  lookingFor: string;
  hosting?: string;
  cockSize?: string;
  into?: string;
  photos: Photo[];
  isOnline: boolean;
  isLive?: boolean;
  lastSeen: number;
  latitude?: number;
  longitude?: number;
}

export interface NearbyUser {
  id: string;
  name: string;
  age: string;
  position: string;
  bodyType: string;
  endowment?: string;
  lookingFor: string;
  hosting?: string;
  cockSize?: string;
  into?: string;
  photos: Photo[];
  isOnline: boolean;
  isLive?: boolean;
  lastSeen: number;
  latitude: number;
  longitude: number;
  distanceMiles: number;
  isMe?: boolean;
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  timestamp: number;
  read: boolean;
}

export interface Conversation {
  userId: string;
  lastMessage: string;
  lastTimestamp: number;
  unreadCount: number;
}

export interface IncomingUnlockRequest {
  requesterId: string;
  createdAt: number;
  name: string;
  photoUri: string | null;
  isOnline: boolean;
}

export interface AppNotification {
  id: string;
  senderId: string;
  type: "profile_view" | "liked_you";
  senderName: string;
  senderPhotoUri: string | null;
  createdAt: number;
  read: boolean;
}

interface AppContextValue {
  myProfile: UserProfile | null;
  userToken: string | null;
  isSetup: boolean;
  nearbyUsers: NearbyUser[];
  nearbyRadius: number | null;
  setNearbyRadius: (r: number | null) => void;
  unlockedUsers: Record<string, boolean>;
  profilesWhoUnlockedMe: string[];
  conversations: Conversation[];
  blockedUsers: string[];
  hotStuff: string[];
  archivedConversations: string[];
  saveProfile: (profile: Partial<UserProfile>) => Promise<void>;
  addPhoto: (uri: string, isLocked: boolean, base64?: string | null) => Promise<void>;
  removePhoto: (photoId: string) => Promise<void>;
  togglePhotoLock: (photoId: string) => Promise<void>;
  movePhoto: (photoId: string, direction: "up" | "down") => Promise<void>;
  reorderPhotosWithinGallery: (isLocked: boolean, orderedIds: string[]) => Promise<void>;
  setMainPhoto: (photoId: string) => Promise<void>;
  grantUnlock: (userId: string) => Promise<void>;
  requestUnlock: (userId: string) => Promise<void>;
  hasUnlocked: (userId: string) => boolean;
  hasGrantedUnlock: (userId: string) => boolean;
  canSeeLockedPhotos: (userId: string) => boolean;
  incomingUnlockRequests: IncomingUnlockRequest[];
  approveUnlockRequest: (requesterId: string) => Promise<void>;
  denyUnlockRequest: (requesterId: string) => Promise<void>;
  refreshNearbyUsers: (lat?: number, lon?: number) => void;
  isLoading: boolean;
  getMessages: (userId: string) => Message[];
  sendMessage: (userId: string, text: string) => Promise<void>;
  markRead: (userId: string) => Promise<void>;
  blockUser: (userId: string) => Promise<void>;
  unblockUser: (userId: string) => Promise<void>;
  isBlocked: (userId: string) => boolean;
  addToHotStuff: (userId: string) => Promise<void>;
  removeFromHotStuff: (userId: string) => Promise<void>;
  isHotStuff: (userId: string) => boolean;
  archiveConversation: (userId: string) => Promise<void>;
  unarchiveConversation: (userId: string) => Promise<void>;
  isArchived: (userId: string) => boolean;
  deleteConversation: (userId: string) => Promise<void>;
  getUserById: (userId: string) => NearbyUser | undefined;
  setActivePeer: (userId: string | null) => void;
  deleteMyProfile: () => Promise<void>;
  notifications: AppNotification[];
  unreadNotificationCount: number;
  recordProfileView: (userId: string) => Promise<void>;
  markNotificationsRead: () => Promise<void>;
  newRadarEntrants: NearbyUser[];
  dismissRadarEntrant: () => void;
  isLive: boolean;
  goLive: () => Promise<void>;
  goIdle: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

const STORAGE_KEYS = {
  USER_TOKEN: "radar_user_token",
  MY_PROFILE: "radar_my_profile",
  UNLOCKED_USERS: "radar_unlocked_users",
};

function profileToNearbyUser(profile: UserProfile, lat: number, lon: number): NearbyUser {
  return {
    id: profile.id,
    name: profile.name,
    age: profile.age,
    position: profile.position,
    bodyType: profile.bodyType,
    endowment: profile.endowment,
    lookingFor: profile.lookingFor,
    hosting: profile.hosting,
    cockSize: profile.cockSize,
    into: profile.into,
    photos: profile.photos,
    isOnline: true,
    isLive: profile.isLive ?? true,
    lastSeen: Date.now(),
    latitude: lat,
    longitude: lon,
    distanceMiles: 0,
    isMe: true,
  };
}

function mergeNearbyList(
  myProfile: UserProfile | null,
  serverUsers: NearbyUser[],
  lat: number,
  lon: number,
  blockedIds: string[]
): NearbyUser[] {
  const combined: NearbyUser[] = serverUsers.filter((u) => !blockedIds.includes(u.id));
  // Sort all users closest-first
  combined.sort((a, b) => a.distanceMiles - b.distanceMiles);
  // Prepend the current user so they appear in browse and on the map
  if (myProfile?.name) {
    return [profileToNearbyUser(myProfile, lat, lon), ...combined];
  }
  return combined;
}

const POLL_NEARBY_MS = 15000;
const POLL_CHAT_MS = 4000;
const HEARTBEAT_MS = 20_000;

export function AppProvider({ children }: { children: ReactNode }) {
  const [myProfile, setMyProfile] = useState<UserProfile | null>(null);
  const [userToken, setUserToken] = useState<string | null>(null);
  const [serverNearby, setServerNearby] = useState<NearbyUser[]>([]);
  const [unlockedUsers, setUnlockedUsers] = useState<Record<string, boolean>>({});
  const [receivedUnlocks, setReceivedUnlocks] = useState<Record<string, boolean>>({});
  const [grantedUnlocks, setGrantedUnlocks] = useState<Record<string, boolean>>({});
  const [messagesMap, setMessagesMap] = useState<Record<string, Message[]>>({});
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
  const [hotStuff, setHotStuff] = useState<string[]>([]);
  const [archivedConversations, setArchivedConversations] = useState<string[]>([]);
  const [incomingUnlockRequests, setIncomingUnlockRequests] = useState<IncomingUnlockRequest[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activePeer, setActivePeer] = useState<string | null>(null);

  const lastSeenInboundRef = useRef<Record<string, number>>({});
  const tokenRef = useRef<string | null>(null);
  const profileRef = useRef<UserProfile | null>(null);
  const activePeerRef = useRef<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [newRadarEntrants, setNewRadarEntrants] = useState<NearbyUser[]>([]);
  const knownNearbyIdsRef = useRef<Set<string>>(new Set());
  const initialNearbyLoadedRef = useRef(false);
  const wsReconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nearbyRadiusRef = useRef<number | null>(5);
  const [nearbyRadius, setNearbyRadiusState] = useState<number | null>(5);

  useEffect(() => { nearbyRadiusRef.current = nearbyRadius; }, [nearbyRadius]);
  useEffect(() => { tokenRef.current = userToken; }, [userToken]);
  useEffect(() => { profileRef.current = myProfile; }, [myProfile]);
  useEffect(() => { activePeerRef.current = activePeer; }, [activePeer]);

  // ---- Initial bootstrap
  useEffect(() => {
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function connectWebSocket(token: string) {
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) return;
    if (wsReconnectRef.current) { clearTimeout(wsReconnectRef.current); wsReconnectRef.current = null; }

    const wsBase = API_BASE.replace(/^https?:\/\//, "");
    const protocol = typeof window !== "undefined" && window.location.protocol === "http:" ? "ws:" : "wss:";
    const ws = new WebSocket(`${protocol}//${wsBase}/api/ws?token=${token}`);

    ws.onopen = () => {
      console.log("[WS] connected");
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string);
        if (data.type === "notification") {
          const notif = data.notification as AppNotification;
          setNotifications((prev) => {
            if (prev.some((n) => n.id === notif.id)) return prev;
            return [notif, ...prev];
          });
        }
        if (data.type === "unlock_approved") {
          // The person whose photos we requested just approved us — update immediately
          const granterId = String(data.granterId);
          setReceivedUnlocks((prev) => ({ ...prev, [granterId]: true }));
          playMessageAlert().catch(() => {});
        }
        if (data.type === "unlock_request") {
          // A nearby guy is requesting access to our private photos — notify with sound
          const req = data.request as IncomingUnlockRequest;
          setIncomingUnlockRequests((prev) => {
            if (prev.some((r) => r.requesterId === req.requesterId)) return prev;
            return [req, ...prev];
          });
          playMessageAlert().catch(() => {});
        }
        if (data.type === "message") {
          const msg: Message = {
            id: data.message.id,
            senderId: data.message.senderId,
            text: data.message.text,
            timestamp: data.message.timestamp,
            read: data.message.read,
          };
          const peerId = msg.senderId;
          setMessagesMap((prev) => {
            const existing = prev[peerId] ?? [];
            if (existing.some((m) => m.id === msg.id)) return prev;
            return { ...prev, [peerId]: [...existing, msg] };
          });
          setConversations((prev) => {
            const others = prev.filter((c) => c.userId !== peerId);
            const isActive = activePeerRef.current === peerId;
            return [{ userId: peerId, lastMessage: msg.text, lastTimestamp: msg.timestamp, unreadCount: isActive ? 0 : 1 }, ...others];
          });
          // Play alert unless the user is already looking at that chat
          if (activePeerRef.current !== peerId) {
            playMessageAlert().catch(() => {});
          }
        }
      } catch {}
    };

    ws.onerror = () => ws.close();

    ws.onclose = () => {
      wsRef.current = null;
      wsReconnectRef.current = setTimeout(() => {
        const tk = tokenRef.current;
        if (tk) connectWebSocket(tk);
      }, 4000);
    };

    wsRef.current = ws;
  }

  async function registerForPushNotifications(token: string) {
    if (Platform.OS === "web") return;
    try {
      const { status: existing } = await Notifications.getPermissionsAsync();
      let finalStatus = existing;
      if (existing !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== "granted") return;
      const projectId = (await import("expo-constants")).default.expoConfig?.extra?.eas?.projectId;
      const tokenData = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined as never);
      const pushToken = tokenData.data;
      await api("/api/push-token", { method: "PUT", token, body: { pushToken } });
    } catch (e) {
      console.log("[push] registration skipped:", e);
    }
  }

  async function playNotificationSound() {
    playMessageAlert().catch(() => {});
  }

  async function bootstrap() {
    try {
      const [tokenStr, profileJson, unlockedJson] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.USER_TOKEN),
        AsyncStorage.getItem(STORAGE_KEYS.MY_PROFILE),
        AsyncStorage.getItem(STORAGE_KEYS.UNLOCKED_USERS),
      ]);
      let token = tokenStr;
      if (!token) {
        token = Crypto.randomUUID();
        await AsyncStorage.setItem(STORAGE_KEYS.USER_TOKEN, token);
      }
      setUserToken(token);
      tokenRef.current = token;

      // Try server profile first
      let profile: UserProfile | null = null;
      try {
        profile = await api<UserProfile>(`/api/profile/${token}`);
      } catch {
        if (profileJson) {
          try { profile = JSON.parse(profileJson) as UserProfile; } catch {}
        }
      }
      if (profile) {
        setMyProfile(profile);
        profileRef.current = profile;
        await AsyncStorage.setItem(STORAGE_KEYS.MY_PROFILE, JSON.stringify(profile));
      }

      if (unlockedJson) { try { setUnlockedUsers(JSON.parse(unlockedJson)); } catch {} }

      // Initial server-state fetches (best effort)
      await Promise.allSettled([
        refreshBlocks(token),
        refreshHotStuff(token),
        refreshArchive(token),
        refreshGrantedUnlocks(token),
        refreshReceivedUnlocks(token),
        refreshIncomingUnlockRequests(token),
        refreshConversations(token),
        fetchNotifications(token),
      ]);

      // Real-time connections
      connectWebSocket(token);
      registerForPushNotifications(token);
    } catch (e) {
      console.error("bootstrap err", e);
    } finally {
      setIsLoading(false);
    }
  }

  async function refreshBlocks(token: string) {
    try { setBlockedUsers(await api<string[]>(`/api/blocks`, { token })); } catch {}
  }
  async function refreshHotStuff(token: string) {
    try { setHotStuff(await api<string[]>(`/api/hot-stuff`, { token })); } catch {}
  }
  async function refreshArchive(token: string) {
    try { setArchivedConversations(await api<string[]>(`/api/archive`, { token })); } catch {}
  }
  async function refreshGrantedUnlocks(token: string) {
    try {
      const arr = await api<string[]>(`/api/photo-unlocks/granted`, { token });
      const obj: Record<string, boolean> = {};
      arr.forEach((id) => { obj[id] = true; });
      setGrantedUnlocks(obj);
    } catch {}
  }
  async function refreshReceivedUnlocks(token: string) {
    try {
      // Returns IDs of users who have approved your unlock request
      const arr = await api<string[]>(`/api/photo-unlocks/received`, { token });
      const obj: Record<string, boolean> = {};
      arr.forEach((id) => { obj[id] = true; });
      setReceivedUnlocks(obj);
    } catch {}
  }
  async function refreshIncomingUnlockRequests(token: string) {
    try {
      const arr = await api<IncomingUnlockRequest[]>(
        `/api/photo-unlock-requests/incoming`,
        { token },
      );
      setIncomingUnlockRequests(arr);
    } catch {}
  }

  async function fetchNotifications(token: string) {
    try {
      const arr = await api<AppNotification[]>(`/api/notifications`, { token });
      setNotifications(arr);
    } catch {}
  }

  async function recordProfileView(userId: string) {
    if (!userToken || !myProfile?.name) return;
    try { await api(`/api/profile-view/${userId}`, { method: "POST", token: userToken }); } catch {}
  }

  async function markNotificationsRead() {
    if (!userToken) return;
    try {
      await api(`/api/notifications/read`, { method: "POST", token: userToken });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {}
  }
  async function refreshConversations(token: string) {
    try {
      const convs = await api<Conversation[]>(`/api/conversations`, { token });
      setConversations(convs);
      // detect new inbound messages -> play sound
      let foundNew = false;
      for (const c of convs) {
        const prev = lastSeenInboundRef.current[c.userId] ?? 0;
        if (c.unreadCount > 0 && c.lastTimestamp > prev && c.userId !== activePeerRef.current) {
          foundNew = true;
        }
        lastSeenInboundRef.current[c.userId] = c.lastTimestamp;
      }
      if (foundNew) playNotificationSound();
    } catch {}
  }

  // ---- Polling: nearby users
  const refreshNearbyUsers = useCallback(async (lat?: number, lon?: number) => {
    const useLat = lat ?? profileRef.current?.latitude;
    const useLon = lon ?? profileRef.current?.longitude;
    if (useLat == null || useLon == null) return;
    try {
      const token = tokenRef.current;
      const apiRadius = nearbyRadiusRef.current ?? 50;
      const url = `/api/nearby?lat=${useLat}&lon=${useLon}&radius=${apiRadius}`;
      const list = await api<NearbyUser[]>(url, { token });
      setServerNearby(list);
    } catch (e) {
      console.log("nearby err", e);
    }
  }, []);

  function setNearbyRadius(r: number | null) {
    nearbyRadiusRef.current = r;
    setNearbyRadiusState(r);
    const useLat = profileRef.current?.latitude;
    const useLon = profileRef.current?.longitude;
    if (useLat != null && useLon != null) {
      const apiRadius = r ?? 50;
      const token = tokenRef.current;
      api<NearbyUser[]>(`/api/nearby?lat=${useLat}&lon=${useLon}&radius=${apiRadius}`, { token })
        .then(setServerNearby)
        .catch(() => {});
    }
  }

  // Polling effect for nearby — use profile location if available, otherwise fall back to
  // default coordinates so seed profiles are visible before setup is complete.
  const DEFAULT_LAT = 39.7392;
  const DEFAULT_LON = -104.9903;
  useEffect(() => {
    const lat = myProfile?.latitude ?? DEFAULT_LAT;
    const lon = myProfile?.longitude ?? DEFAULT_LON;
    refreshNearbyUsers(lat, lon);
    const id = setInterval(() => refreshNearbyUsers(
      profileRef.current?.latitude ?? DEFAULT_LAT,
      profileRef.current?.longitude ?? DEFAULT_LON,
    ), POLL_NEARBY_MS);
    return () => clearInterval(id);
  }, [myProfile?.latitude, myProfile?.longitude, refreshNearbyUsers]);

  // Detect new radar entrants from server nearby list
  useEffect(() => {
    const onlineOthers = serverNearby.filter((u) => u.isOnline);
    if (!initialNearbyLoadedRef.current) {
      // First load — seed the known set, don't alert for existing users
      onlineOthers.forEach((u) => knownNearbyIdsRef.current.add(u.id));
      if (serverNearby.length > 0) initialNearbyLoadedRef.current = true;
      return;
    }
    // Find genuinely new entrants
    const entrants = onlineOthers.filter((u) => !knownNearbyIdsRef.current.has(u.id));
    // Update known set — add new entrants
    onlineOthers.forEach((u) => knownNearbyIdsRef.current.add(u.id));
    // Collect departed IDs and remove them from the known set
    const currentIds = new Set(onlineOthers.map((u) => u.id));
    const departedIds = new Set<string>();
    knownNearbyIdsRef.current.forEach((id) => {
      if (!currentIds.has(id)) {
        departedIds.add(id);
        knownNearbyIdsRef.current.delete(id);
      }
    });
    // Purge departed users from the pending entrants queue — no point alerting
    // for someone who has already left the area
    if (departedIds.size > 0) {
      setNewRadarEntrants((prev) => prev.filter((u) => !departedIds.has(u.id)));
    }
    if (entrants.length > 0) {
      setNewRadarEntrants((prev) => [...prev, ...entrants]);
      playRadarPing();
    }
  }, [serverNearby]);

  // Heartbeat: keep me online & update location (best effort)
  useEffect(() => {
    if (!userToken || !myProfile?.name) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    async function sendHeartbeat() {
      const body: Record<string, unknown> = {};
      const lat = profileRef.current?.latitude;
      const lon = profileRef.current?.longitude;
      if (lat != null) body.latitude = lat;
      if (lon != null) body.longitude = lon;
      await api(`/api/heartbeat`, { method: "POST", token: userToken, body });
    }

    async function beat() {
      if (cancelled) return;
      try {
        await sendHeartbeat();
      } catch {
        // Retry once after 8 seconds if the first attempt fails
        if (!cancelled) {
          retryTimer = setTimeout(async () => {
            if (!cancelled) {
              try { await sendHeartbeat(); } catch {}
            }
          }, 8_000);
        }
      }
    }

    async function markOffline() {
      if (cancelled) return;
      try {
        await api(`/api/offline`, { method: "POST", token: userToken });
      } catch {}
    }

    beat();
    const id = setInterval(beat, HEARTBEAT_MS);

    // AppState: re-establish presence on foreground, drop on background
    let foregroundDebounce: ReturnType<typeof setTimeout> | null = null;
    function handleAppState(next: AppStateStatus) {
      if (next === "active") {
        // Small delay so the network is ready
        foregroundDebounce = setTimeout(() => { if (!cancelled) beat(); }, 500);
      } else if (next === "background" || next === "inactive") {
        if (foregroundDebounce) clearTimeout(foregroundDebounce);
        markOffline();
      }
    }
    const sub = AppState.addEventListener("change", handleAppState);

    // Web: use Page Visibility API
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        setTimeout(() => { if (!cancelled) beat(); }, 300);
      } else {
        markOffline();
      }
    }
    if (Platform.OS === "web" && typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibility);
    }

    return () => {
      cancelled = true;
      clearInterval(id);
      if (retryTimer) clearTimeout(retryTimer);
      if (foregroundDebounce) clearTimeout(foregroundDebounce);
      sub.remove();
      if (Platform.OS === "web" && typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibility);
      }
      markOffline();
    };
  }, [userToken, myProfile?.name]);

  // Polling effect for conversations + active chat
  useEffect(() => {
    if (!userToken || !myProfile?.name) return;
    let cancelled = false;
    async function tick() {
      if (cancelled) return;
      const tk = tokenRef.current!;
      await refreshConversations(tk);
      await refreshIncomingUnlockRequests(tk);
      const peer = activePeerRef.current;
      if (peer) {
        try {
          const msgs = await api<Message[]>(`/api/messages/${peer}`, { token: tk });
          setMessagesMap((prev) => ({ ...prev, [peer]: msgs }));
        } catch {}
      }
    }
    tick();
    const id = setInterval(tick, POLL_CHAT_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [userToken, myProfile?.name]);

  // When activePeer changes, fetch immediately + mark read
  useEffect(() => {
    if (!activePeer || !userToken) return;
    (async () => {
      try {
        const msgs = await api<Message[]>(`/api/messages/${activePeer}`, { token: userToken });
        setMessagesMap((prev) => ({ ...prev, [activePeer]: msgs }));
        await api(`/api/messages/read/${activePeer}`, { method: "POST", token: userToken });
        await refreshConversations(userToken);
      } catch {}
    })();
  }, [activePeer, userToken]);

  // Push notification: play chime when a message notification arrives while app is foregrounded
  // (normally the WS handler covers this, but this catches edge cases where WS isn't active)
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as Record<string, unknown> | null;
      if (data?.notifType === "new_message" && typeof data.senderId === "string") {
        if (activePeerRef.current !== data.senderId) {
          playMessageAlert().catch(() => {});
        }
      }
    });
    return () => sub.remove();
  }, []);

  // Push notification tap: navigate to the chat thread
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown> | null;
      if (data?.notifType === "new_message" && typeof data.senderId === "string") {
        router.push(`/chat/${data.senderId}` as never);
      }
    });
    return () => sub.remove();
  }, []);

  // ---- Profile mutations
  async function saveProfile(updates: Partial<UserProfile>) {
    let token = userToken;
    if (!token) {
      token = Crypto.randomUUID();
      await AsyncStorage.setItem(STORAGE_KEYS.USER_TOKEN, token);
      setUserToken(token);
      tokenRef.current = token;
    }
    const existing = myProfile;
    const merged: UserProfile = {
      id: existing?.id ?? token,
      name: existing?.name ?? "",
      age: existing?.age ?? "",
      bio: existing?.bio ?? "",
      position: existing?.position ?? "",
      bodyType: existing?.bodyType ?? "",
      lookingFor: existing?.lookingFor ?? "",
      hosting: existing?.hosting ?? "",
      photos: existing?.photos ?? [],
      isOnline: true,
      lastSeen: Date.now(),
      ...updates,
    };
    try {
      const saved = await api<UserProfile>(`/api/profile`, {
        method: "PUT",
        token,
        body: merged,
      });
      setMyProfile(saved);
      profileRef.current = saved;
      await AsyncStorage.setItem(STORAGE_KEYS.MY_PROFILE, JSON.stringify(saved));
    } catch (e) {
      console.error("saveProfile err", e);
      // Still set locally so app can keep working offline
      setMyProfile(merged);
      profileRef.current = merged;
      await AsyncStorage.setItem(STORAGE_KEYS.MY_PROFILE, JSON.stringify(merged));
    }
    if (merged.latitude && merged.longitude) {
      refreshNearbyUsers(merged.latitude, merged.longitude);
    }
  }

  async function addPhoto(uri: string, isLocked: boolean, base64?: string | null) {
    if (!myProfile || !userToken) return;
    let storedUri = uri;
    let thumbnailUri: string | undefined;
    try {
      const result = await uploadPhoto(uri, userToken, base64);
      storedUri = result.url;
      thumbnailUri = result.thumbnailUrl;
    } catch (e) {
      // Backend not available — fall back to a portable local reference so the
      // photo still shows up everywhere in the app.
      console.warn("photo upload failed, storing locally", e);
      if (base64 && base64.length > 0) {
        storedUri = `data:image/jpeg;base64,${base64}`;
      }
    }
    const newPhoto: Photo = { id: Crypto.randomUUID(), uri: storedUri, thumbnailUri, isLocked };
    await saveProfile({ photos: [...(myProfile.photos ?? []), newPhoto] });
  }
  async function removePhoto(photoId: string) {
    if (!myProfile) return;
    await saveProfile({ photos: myProfile.photos.filter((p) => p.id !== photoId) });
  }
  async function togglePhotoLock(photoId: string) {
    if (!myProfile) return;
    const next = myProfile.photos.map((p) =>
      p.id === photoId ? { ...p, isLocked: !p.isLocked } : p,
    );
    await saveProfile({ photos: next });
  }
  async function movePhoto(photoId: string, direction: "up" | "down") {
    if (!myProfile) return;
    const photos = [...myProfile.photos];
    const idx = photos.findIndex((p) => p.id === photoId);
    if (idx < 0) return;
    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= photos.length) return;
    [photos[idx], photos[swapWith]] = [photos[swapWith], photos[idx]];
    await saveProfile({ photos });
  }
  async function reorderPhotosWithinGallery(isLocked: boolean, orderedIds: string[]) {
    if (!myProfile) return;
    const all = myProfile.photos;
    // Keep the relative order of "the other gallery" intact, replace this gallery's
    // entries with the new order. The merged array keeps each photo's existing slot
    // index, but the entries belonging to this gallery are filled in `orderedIds` order.
    const idToPhoto = new Map(all.map((p) => [p.id, p]));
    const orderedQueue = orderedIds
      .map((id) => idToPhoto.get(id))
      .filter((p): p is Photo => Boolean(p) && p!.isLocked === isLocked);
    if (orderedQueue.length === 0) return;
    let qi = 0;
    const next = all.map((p) => {
      if (p.isLocked === isLocked) {
        const replacement = orderedQueue[qi++];
        return replacement ?? p;
      }
      return p;
    });
    await saveProfile({ photos: next });
  }
  async function setMainPhoto(photoId: string) {
    if (!myProfile) return;
    const target = myProfile.photos.find((p) => p.id === photoId);
    if (!target) return;
    const others = myProfile.photos.filter((p) => p.id !== photoId);
    await saveProfile({ photos: [{ ...target, isLocked: false }, ...others] });
  }

  // ---- Photo unlock
  async function grantUnlock(userId: string) {
    if (!userToken) return;
    setGrantedUnlocks((p) => ({ ...p, [userId]: true }));
    try { await api(`/api/photo-unlock/${userId}`, { method: "POST", token: userToken }); }
    catch (e) { console.log("grantUnlock err", e); }
  }
  async function requestUnlock(userId: string) {
    // Local optimistic state for the requester's UI ("Request pending...")
    const updated = { ...unlockedUsers, [userId]: true };
    setUnlockedUsers(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.UNLOCKED_USERS, JSON.stringify(updated));
    // Also record the request on the server so the target gets it in their inbox.
    if (!userToken) return;
    try {
      await api(`/api/photo-unlock-requests/${userId}`, {
        method: "POST",
        token: userToken,
      });
    } catch (e) {
      console.log("requestUnlock err", e);
    }
  }

  async function approveUnlockRequest(requesterId: string) {
    if (!userToken) return;
    setIncomingUnlockRequests((prev) =>
      prev.filter((r) => r.requesterId !== requesterId),
    );
    try {
      await api(`/api/photo-unlock-requests/${requesterId}/approve`, {
        method: "POST",
        token: userToken,
      });
    } catch (e) {
      console.log("approveUnlockRequest err", e);
      // Re-sync from server if the call failed
      refreshIncomingUnlockRequests(userToken);
    }
  }

  async function denyUnlockRequest(requesterId: string) {
    if (!userToken) return;
    setIncomingUnlockRequests((prev) =>
      prev.filter((r) => r.requesterId !== requesterId),
    );
    try {
      await api(`/api/photo-unlock-requests/${requesterId}/deny`, {
        method: "POST",
        token: userToken,
      });
    } catch (e) {
      console.log("denyUnlockRequest err", e);
      refreshIncomingUnlockRequests(userToken);
    }
  }

  // ---- Messaging
  async function sendMessage(userId: string, text: string) {
    if (!userToken || !myProfile?.name) return;
    const optimistic: Message = {
      id: `tmp_${Crypto.randomUUID()}`,
      senderId: myProfile.id,
      text,
      timestamp: Date.now(),
      read: true,
    };
    setMessagesMap((prev) => ({
      ...prev,
      [userId]: [...(prev[userId] ?? []), optimistic],
    }));
    setConversations((prev) => {
      const others = prev.filter((c) => c.userId !== userId);
      return [{ userId, lastMessage: text, lastTimestamp: optimistic.timestamp, unreadCount: 0 }, ...others];
    });
    try {
      const saved = await api<Message>(`/api/messages`, {
        method: "POST",
        token: userToken,
        body: { recipientId: userId, text },
      });
      setMessagesMap((prev) => {
        const arr = (prev[userId] ?? []).map((m) => (m.id === optimistic.id ? saved : m));
        return { ...prev, [userId]: arr };
      });
    } catch (e) {
      console.log("sendMessage err", e);
    }
  }

  async function markRead(userId: string) {
    if (!userToken) return;
    try { await api(`/api/messages/read/${userId}`, { method: "POST", token: userToken }); } catch {}
    setConversations((prev) => prev.map((c) => (c.userId === userId ? { ...c, unreadCount: 0 } : c)));
  }

  // ---- Block
  async function blockUser(userId: string) {
    if (!userToken || blockedUsers.includes(userId)) return;
    setBlockedUsers((p) => [...p, userId]);
    setConversations((p) => p.filter((c) => c.userId !== userId));
    try { await api(`/api/block/${userId}`, { method: "POST", token: userToken }); } catch {}
  }
  async function unblockUser(userId: string) {
    if (!userToken) return;
    setBlockedUsers((p) => p.filter((id) => id !== userId));
    try { await api(`/api/block/${userId}`, { method: "DELETE", token: userToken }); } catch {}
  }

  // ---- Hot Stuff
  async function addToHotStuff(userId: string) {
    if (!userToken || hotStuff.includes(userId)) return;
    setHotStuff((p) => [...p, userId]);
    try { await api(`/api/hot-stuff/${userId}`, { method: "POST", token: userToken }); } catch {}
  }
  async function removeFromHotStuff(userId: string) {
    if (!userToken) return;
    setHotStuff((p) => p.filter((id) => id !== userId));
    try { await api(`/api/hot-stuff/${userId}`, { method: "DELETE", token: userToken }); } catch {}
  }

  // ---- Archive
  async function archiveConversation(userId: string) {
    if (!userToken || archivedConversations.includes(userId)) return;
    setArchivedConversations((p) => [...p, userId]);
    try { await api(`/api/archive/${userId}`, { method: "POST", token: userToken }); } catch {}
  }
  async function unarchiveConversation(userId: string) {
    if (!userToken) return;
    setArchivedConversations((p) => p.filter((id) => id !== userId));
    try { await api(`/api/archive/${userId}`, { method: "DELETE", token: userToken }); } catch {}
  }

  // ---- Delete
  async function deleteConversation(userId: string) {
    if (!userToken) return;
    setMessagesMap((prev) => { const n = { ...prev }; delete n[userId]; return n; });
    setConversations((prev) => prev.filter((c) => c.userId !== userId));
    setArchivedConversations((prev) => prev.filter((id) => id !== userId));
    try {
      await api(`/api/messages/${userId}`, { method: "DELETE", token: userToken });
      await api(`/api/archive/${userId}`, { method: "DELETE", token: userToken });
    } catch {}
  }

  async function deleteMyProfile() {
    const token = userToken;
    // Best-effort server wipe; proceed with local reset even if it fails.
    if (token) {
      try {
        await api(`/api/profile`, { method: "DELETE", token });
      } catch (e) {
        console.log("deleteMyProfile err", e);
      }
    }
    // Issue a fresh anonymous token so the user keeps a working session post-delete.
    const newToken = Crypto.randomUUID();
    await AsyncStorage.multiSet([
      [STORAGE_KEYS.USER_TOKEN, newToken],
    ]);
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.MY_PROFILE,
      STORAGE_KEYS.UNLOCKED_USERS,
    ]);
    setUserToken(newToken);
    tokenRef.current = newToken;
    setMyProfile(null);
    profileRef.current = null;
    setUnlockedUsers({});
    setGrantedUnlocks({});
    setMessagesMap({});
    setConversations([]);
    setBlockedUsers([]);
    setHotStuff([]);
    setArchivedConversations([]);
    setIncomingUnlockRequests([]);
    setNotifications([]);
    setServerNearby([]);
    setActivePeer(null);
    activePeerRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;
    if (wsReconnectRef.current) { clearTimeout(wsReconnectRef.current); wsReconnectRef.current = null; }
    connectWebSocket(newToken);
  }

  async function goLive() {
    if (!userToken || !myProfile?.name) return;
    try {
      const body: Record<string, number> = {};
      if (myProfile.latitude != null) body.latitude = myProfile.latitude;
      if (myProfile.longitude != null) body.longitude = myProfile.longitude;
      await api("/api/go-live", { method: "POST", token: userToken, body });
      setMyProfile((prev) => prev ? { ...prev, isLive: true } : prev);
    } catch (e) {
      console.log("goLive err", e);
    }
  }

  async function goOffline() {
    if (!userToken) return;
    try {
      await api("/api/go-offline", { method: "POST", token: userToken });
      setMyProfile((prev) => prev ? { ...prev, isLive: false } : prev);
    } catch (e) {
      console.log("goOffline err", e);
    }
  }

  async function goIdle() {
    if (!userToken) return;
    try {
      await api("/api/go-idle", { method: "POST", token: userToken });
      setMyProfile((prev) => prev ? { ...prev, isLive: false } : prev);
    } catch (e) {
      console.log("goIdle err", e);
    }
  }

  // Auto go-live whenever the app is open and profile is ready
  const hasAutoGoLive = useRef(false);
  useEffect(() => {
    if (isSetup && userToken && !hasAutoGoLive.current) {
      hasAutoGoLive.current = true;
      goLive();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSetup, userToken]);

  function dismissRadarEntrant() {
    setNewRadarEntrants((prev) => prev.slice(1));
  }

  function getMessages(userId: string): Message[] { return messagesMap[userId] ?? []; }
  function hasUnlocked(userId: string) { return !!unlockedUsers[userId]; }
  function hasGrantedUnlock(userId: string) { return !!grantedUnlocks[userId]; }
  function canSeeLockedPhotos(userId: string) { return !!receivedUnlocks[userId]; }
  function isBlocked(userId: string) { return blockedUsers.includes(userId); }
  function isHotStuff(userId: string) { return hotStuff.includes(userId); }
  function isArchived(userId: string) { return archivedConversations.includes(userId); }
  const unreadNotificationCount = notifications.filter((n) => !n.read).length;

  const lat = myProfile?.latitude ?? 37.7749;
  const lon = myProfile?.longitude ?? -122.4194;
  const nearbyUsers = useMemo(() => {
    const merged = mergeNearbyList(myProfile, serverNearby, lat, lon, blockedUsers);
    if (nearbyRadius !== null) {
      return merged.filter((u) => u.isMe || u.distanceMiles <= nearbyRadius);
    }
    return merged;
  }, [myProfile, serverNearby, lat, lon, blockedUsers, nearbyRadius]);

  function getUserById(userId: string) { return nearbyUsers.find((u) => u.id === userId); }

  const profilesWhoUnlockedMe = Object.keys(grantedUnlocks);
  const isSetup = !!myProfile?.name;
  const isLive = myProfile?.isLive ?? false;

  const value = useMemo(() => ({
    myProfile, userToken, isSetup, isLive, nearbyUsers, nearbyRadius, setNearbyRadius, unlockedUsers, profilesWhoUnlockedMe,
    goIdle,
    conversations, blockedUsers, hotStuff, archivedConversations,
    saveProfile, addPhoto, removePhoto, togglePhotoLock, movePhoto, reorderPhotosWithinGallery, setMainPhoto,
    grantUnlock, requestUnlock, hasUnlocked, hasGrantedUnlock, canSeeLockedPhotos,
    incomingUnlockRequests, approveUnlockRequest, denyUnlockRequest,
    refreshNearbyUsers, isLoading, getMessages, sendMessage, markRead,
    blockUser, unblockUser, isBlocked,
    addToHotStuff, removeFromHotStuff, isHotStuff,
    archiveConversation, unarchiveConversation, isArchived,
    deleteConversation, getUserById, setActivePeer,
    deleteMyProfile,
    notifications, unreadNotificationCount, recordProfileView, markNotificationsRead,
    newRadarEntrants, dismissRadarEntrant,
    goLive, goIdle,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [myProfile, userToken, isSetup, isLive, nearbyUsers, unlockedUsers, grantedUnlocks,
    receivedUnlocks, conversations, blockedUsers, hotStuff, archivedConversations, messagesMap,
    incomingUnlockRequests, isLoading, notifications, unreadNotificationCount,
    newRadarEntrants]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
