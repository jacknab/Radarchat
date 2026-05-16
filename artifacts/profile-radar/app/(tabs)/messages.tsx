import React from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Image,
  Platform,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import {
  useApp,
  Conversation,
  NearbyUser,
  IncomingUnlockRequest,
} from "@/contexts/AppContext";
import { resolvePhotoUri } from "@/lib/api";

function timeLabel(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

const FALLBACK_COLORS = ["#FF7A00", "#6C5CE7", "#00B4D8", "#06D6A0", "#FFB703", "#FB8500"];
function fallbackColorFor(name: string) {
  if (!name) return Colors.textMuted;
  return FALLBACK_COLORS[name.charCodeAt(0) % FALLBACK_COLORS.length];
}

function UnlockRequestCard({
  req,
  onApprove,
  onDeny,
}: {
  req: IncomingUnlockRequest;
  onApprove: () => void;
  onDeny: () => void;
}) {
  const displayName = req.name || "Someone nearby";
  return (
    <View style={styles.requestCard}>
      <View style={styles.requestAvatarWrap}>
        {req.photoUri ? (
          <Image
            source={{ uri: resolvePhotoUri(req.photoUri) }}
            style={styles.requestAvatar}
            resizeMode="cover"
          />
        ) : (
          <View
            style={[
              styles.requestAvatar,
              {
                backgroundColor: fallbackColorFor(displayName),
                alignItems: "center",
                justifyContent: "center",
              },
            ]}
          >
            <Text style={styles.avatarLetter}>{displayName[0] ?? "?"}</Text>
          </View>
        )}
        <View style={styles.requestLockBadge}>
          <Ionicons name="lock-open" size={10} color="#fff" />
        </View>
        {req.isOnline && <View style={styles.requestOnlineDot} />}
      </View>

      <View style={styles.requestBody}>
        <Text style={styles.requestName} numberOfLines={1}>
          {displayName}
        </Text>
        <Text style={styles.requestSub} numberOfLines={1}>
          wants to see your locked photos · {timeLabel(req.createdAt)}
        </Text>
        <View style={styles.requestActions}>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              onDeny();
            }}
            style={({ pressed }) => [
              styles.actionBtn,
              styles.denyBtn,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="close" size={15} color={Colors.text} />
            <Text style={styles.denyBtnText}>Deny</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              onApprove();
            }}
            style={({ pressed }) => [
              styles.actionBtn,
              styles.grantBtn,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Ionicons name="lock-open" size={15} color="#fff" />
            <Text style={styles.grantBtnText}>Grant</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function UnlockRequestsInbox({
  requests,
  onApprove,
  onDeny,
}: {
  requests: IncomingUnlockRequest[];
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
}) {
  if (requests.length === 0) return null;
  return (
    <View style={styles.inboxSection}>
      <View style={styles.inboxHeader}>
        <View style={styles.inboxTitleRow}>
          <Ionicons name="lock-open" size={14} color={Colors.locked} />
          <Text style={styles.inboxTitle}>Photo Unlock Requests</Text>
        </View>
        <View style={styles.inboxCountPill}>
          <Text style={styles.inboxCountText}>{requests.length}</Text>
        </View>
      </View>
      <ScrollView
        style={styles.inboxList}
        contentContainerStyle={styles.inboxListContent}
        showsVerticalScrollIndicator={false}
      >
        {requests.map((req) => (
          <UnlockRequestCard
            key={req.requesterId}
            req={req}
            onApprove={() => onApprove(req.requesterId)}
            onDeny={() => onDeny(req.requesterId)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function ConvItem({ conv, user, isHot }: { conv: Conversation; user: NearbyUser | undefined; isHot: boolean }) {
  const coverPhoto = user?.photos.find((p) => !p.isLocked);
  const fallbackColor = user ? fallbackColorFor(user.name) : Colors.textMuted;

  return (
    <Pressable
      style={({ pressed }) => [styles.convItem, pressed && { opacity: 0.75 }]}
      onPress={() => {
        Haptics.selectionAsync();
        router.push({ pathname: "/chat/[id]", params: { id: conv.userId } });
      }}
    >
      <View style={styles.avatarWrap}>
        {coverPhoto ? (
          <Image source={{ uri: resolvePhotoUri(coverPhoto.uri) }} style={styles.avatar} resizeMode="cover" />
        ) : (
          <View style={[styles.avatar, { backgroundColor: fallbackColor, alignItems: "center", justifyContent: "center" }]}>
            <Text style={styles.avatarLetter}>{user?.name[0] ?? "?"}</Text>
          </View>
        )}
        {user?.isOnline && <View style={styles.onlineDot} />}
        {isHot && (
          <View style={styles.hotStuffBadge}>
            <Ionicons name="flame" size={10} color="#fff" />
          </View>
        )}
      </View>

      <View style={styles.convBody}>
        <View style={styles.convTopRow}>
          <View style={styles.convNameRow}>
            <Text style={styles.convName} numberOfLines={1}>{user?.name ?? "Unknown"}</Text>
            {isHot && <Ionicons name="flame" size={13} color={Colors.accent} />}
          </View>
          <Text style={styles.convTime}>{timeLabel(conv.lastTimestamp)}</Text>
        </View>
        <View style={styles.convBottomRow}>
          <Text style={[styles.convLast, conv.unreadCount > 0 && styles.convLastUnread]} numberOfLines={1}>
            {conv.lastMessage}
          </Text>
          {conv.unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{conv.unreadCount > 9 ? "9+" : conv.unreadCount}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const {
    conversations,
    getUserById,
    isSetup,
    isArchived,
    isHotStuff,
    incomingUnlockRequests,
    approveUnlockRequest,
    denyUnlockRequest,
  } = useApp();
  const [hotFilter, setHotFilter] = React.useState<"all" | "hot">("all");
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const visibleConversations = conversations
    .filter((c) => !isArchived(c.userId))
    .filter((c) => hotFilter === "hot" ? isHotStuff(c.userId) : true);
  const showInbox = isSetup && incomingUnlockRequests.length > 0;
  const hasContent = visibleConversations.length > 0 || showInbox;

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Text style={styles.headerTitle}>Messages</Text>
          <View style={styles.hotToggleRow}>
            <Pressable
              style={[styles.hotToggleBtn, hotFilter === "all" && styles.hotToggleBtnActive]}
              onPress={() => { Haptics.selectionAsync(); setHotFilter("all"); }}
            >
              <Text style={[styles.hotToggleText, hotFilter === "all" && styles.hotToggleTextActive]}>All</Text>
            </Pressable>
            <Pressable
              style={[styles.hotToggleBtn, hotFilter === "hot" && styles.hotToggleBtnActiveFlame]}
              onPress={() => { Haptics.selectionAsync(); setHotFilter("hot"); }}
            >
              <Ionicons name="flame" size={13} color={hotFilter === "hot" ? "#fff" : Colors.textSecondary} />
              <Text style={[styles.hotToggleText, hotFilter === "hot" && styles.hotToggleTextActive]}>Hot</Text>
            </Pressable>
          </View>
        </View>
        {visibleConversations.length > 0 && (
          <Text style={styles.headerSub}>{visibleConversations.length} conversation{visibleConversations.length !== 1 ? "s" : ""}</Text>
        )}
      </View>

      {!isSetup ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="lock-closed-outline" size={52} color={Colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>Create a profile to message</Text>
          <Text style={styles.emptySub}>You're browsing as a guest. Set up your profile to send and receive messages.</Text>
          <Pressable
            style={styles.browseBtn}
            onPress={() => {
              Haptics.selectionAsync();
              router.push("/setup");
            }}
          >
            <Ionicons name="person-add" size={16} color="#fff" />
            <Text style={styles.browseBtnText}>Create Profile</Text>
          </Pressable>
        </View>
      ) : !hasContent ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="chatbubbles-outline" size={52} color={Colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No messages yet</Text>
          <Text style={styles.emptySub}>Start a conversation by visiting a user's profile and tapping the chat button</Text>
          <Pressable
            style={styles.browseBtn}
            onPress={() => {
              Haptics.selectionAsync();
              router.push("/(tabs)/browse");
            }}
          >
            <Ionicons name="people" size={16} color="#fff" />
            <Text style={styles.browseBtnText}>Browse Nearby Users</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={visibleConversations}
          keyExtractor={(item) => item.userId}
          contentContainerStyle={{
            paddingBottom: insets.bottom + (Platform.OS === "web" ? 84 : 90),
          }}
          ListHeaderComponent={
            showInbox ? (
              <UnlockRequestsInbox
                requests={incomingUnlockRequests}
                onApprove={approveUnlockRequest}
                onDeny={denyUnlockRequest}
              />
            ) : null
          }
          renderItem={({ item }) => (
            <ConvItem conv={item} user={getUserById(item.userId)} isHot={isHotStuff(item.userId)} />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  headerTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerTitle: { fontSize: 26, fontWeight: "700", color: Colors.text, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 13, color: Colors.textSecondary, fontFamily: "Inter_400Regular", marginTop: 2 },
  hotToggleRow: {
    flexDirection: "row",
    backgroundColor: Colors.bgCard,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  hotToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  hotToggleBtnActive: { backgroundColor: Colors.bgCardLight },
  hotToggleBtnActiveFlame: { backgroundColor: Colors.accent },
  hotToggleText: { fontSize: 13, color: Colors.textSecondary, fontFamily: "Inter_500Medium" },
  hotToggleTextActive: { color: "#fff", fontFamily: "Inter_600SemiBold" },

  // Photo Unlock Requests inbox
  inboxSection: {
    marginHorizontal: 12,
    marginTop: 4,
    marginBottom: 12,
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  inboxHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  inboxTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  inboxTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.locked,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    fontFamily: "Inter_700Bold",
  },
  inboxCountPill: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 7,
    backgroundColor: Colors.lockedGlow,
    alignItems: "center",
    justifyContent: "center",
  },
  inboxCountText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.locked,
    fontFamily: "Inter_700Bold",
  },
  inboxList: { maxHeight: 280 },
  inboxListContent: { paddingHorizontal: 10, paddingBottom: 10, gap: 8 },

  requestCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 10,
    borderRadius: 12,
    backgroundColor: Colors.bgCardLight,
  },
  requestAvatarWrap: { position: "relative" },
  requestAvatar: { width: 48, height: 48, borderRadius: 24 },
  requestLockBadge: {
    position: "absolute",
    bottom: -2,
    left: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.locked,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.bgCardLight,
  },
  requestOnlineDot: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.online,
    borderWidth: 2,
    borderColor: Colors.bgCardLight,
  },
  requestBody: { flex: 1, gap: 6 },
  requestName: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
  },
  requestSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
  },
  requestActions: { flexDirection: "row", gap: 8, marginTop: 4 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9,
  },
  denyBtn: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  denyBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
  },
  grantBtn: { backgroundColor: Colors.accent },
  grantBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
    fontFamily: "Inter_700Bold",
  },

  convItem: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, paddingVertical: 14, gap: 14,
  },
  avatarWrap: { position: "relative" },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  avatarLetter: { fontSize: 22, fontWeight: "700", color: "#fff", fontFamily: "Inter_700Bold" },
  onlineDot: {
    position: "absolute", bottom: 1, right: 1,
    width: 13, height: 13, borderRadius: 7,
    backgroundColor: Colors.online, borderWidth: 2, borderColor: Colors.bg,
  },
  convBody: { flex: 1 },
  convTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  convNameRow: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  convName: { fontSize: 16, fontWeight: "600", color: Colors.text, fontFamily: "Inter_600SemiBold", flexShrink: 1 },
  hotStuffBadge: {
    position: "absolute", top: -2, right: -2,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: Colors.accent,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: Colors.bg,
  },
  convTime: { fontSize: 12, color: Colors.textMuted, fontFamily: "Inter_400Regular", marginLeft: 8 },
  convBottomRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  convLast: { fontSize: 14, color: Colors.textMuted, fontFamily: "Inter_400Regular", flex: 1 },
  convLastUnread: { color: Colors.textSecondary, fontFamily: "Inter_500Medium" },
  unreadBadge: {
    minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center",
    paddingHorizontal: 5, marginLeft: 8,
  },
  unreadText: { fontSize: 11, fontWeight: "700", color: "#fff", fontFamily: "Inter_700Bold" },
  separator: { height: 1, backgroundColor: Colors.border, marginLeft: 90 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 40 },
  emptyIconWrap: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: Colors.bgCard, alignItems: "center", justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 22, fontWeight: "600", color: Colors.text, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 14, color: Colors.textSecondary, textAlign: "center", fontFamily: "Inter_400Regular", lineHeight: 20 },
  browseBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginTop: 8, backgroundColor: Colors.accent,
    paddingHorizontal: 22, paddingVertical: 13, borderRadius: 14,
  },
  browseBtnText: { fontSize: 15, fontWeight: "600", color: "#fff", fontFamily: "Inter_600SemiBold" },
});
