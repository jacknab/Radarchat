import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Image,
  Platform,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
  Modal,
  Animated,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Colors } from "@/constants/colors";
import { useApp, NearbyUser } from "@/contexts/AppContext";
import { resolvePhotoUri } from "@/lib/api";
import { formatLastSeenShort } from "@/lib/time";

const { width, height: SCREEN_HEIGHT } = Dimensions.get("window");
const COLUMNS = 3;
const CARD_SIZE = (width - 4) / COLUMNS;

type FilterType = "all" | "online";

const POSITIONS = ["Top", "Bottom", "Versatile", "Vers Top", "Vers Bottom", "Side"];
const LOOKING_FORS = ["Dating", "Friends", "Chat", "Relationship", "Fun"];
const DISTANCE_OPTIONS: { label: string; value: number }[] = [
  { label: "0.5mi", value: 0.5 },
  { label: "1mi", value: 1 },
  { label: "2mi", value: 2 },
  { label: "5mi", value: 5 },
];

function formatDistance(miles: number): string {
  const feet = Math.round(miles * 5280);
  if (feet < 5280) return `${feet} ft`;
  return `${miles.toFixed(1)} mi`;
}

function UserCard({ user, isGuest }: { user: NearbyUser; isGuest?: boolean }) {
  const coverPhoto = user.photos.find((p) => !p.isLocked);
  const coverUri = coverPhoto ? (coverPhoto.thumbnailUri ?? coverPhoto.uri) : null;
  const lockedCount = user.photos.filter((p) => p.isLocked).length;
  const fallbackColors = [
    "#FF7A00","#6C5CE7","#00B4D8","#06D6A0",
    "#FFB703","#FB8500","#FF7A00","#457B9D",
  ];
  const colorIndex = user.name.charCodeAt(0) % fallbackColors.length;
  const blurred = false;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.82 }]}
      onPress={() => {
        if (blurred) {
          Haptics.selectionAsync();
          router.push("/setup");
          return;
        }
        Haptics.selectionAsync();
        router.push({ pathname: "/user/[id]", params: { id: user.id } });
      }}
    >
      {coverUri && !blurred ? (
        <Image
          source={{ uri: resolvePhotoUri(coverUri) }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: blurred ? "#1a1a2e" : fallbackColors[colorIndex], alignItems: "center", justifyContent: "center" }]}>
          {!blurred && <Text style={styles.avatarLetter}>{user.name[0]}</Text>}
        </View>
      )}

      {blurred && (
        <View style={styles.blurOverlay}>
          <Ionicons name="lock-closed-outline" size={20} color="rgba(255,255,255,0.5)" />
        </View>
      )}

      {!blurred && (
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.72)"]}
          style={styles.cardGradient}
          locations={[0.45, 1]}
        />
      )}

      {user.isOnline && !blurred && <View style={styles.onlineDot} />}
      {!user.isOnline && !blurred && !user.isMe && (
        <View style={styles.lastSeenBadge}>
          <Text style={styles.lastSeenText}>{formatLastSeenShort(user.lastSeen, false)}</Text>
        </View>
      )}

      {user.isMe && (
        <View style={styles.youBadge}>
          <Text style={styles.youBadgeText}>YOU</Text>
        </View>
      )}

      {!user.isMe && !blurred && lockedCount > 0 && (
        <View style={styles.lockedBadge}>
          <Ionicons name="lock-closed" size={9} color={Colors.locked} />
          <Text style={styles.lockedCount}>{lockedCount}</Text>
        </View>
      )}

      <View style={styles.cardFooter}>
        <View style={styles.cardFooterLeft}>
          {!user.isMe && !blurred && user.position ? (
            <Text style={styles.positionLabel} numberOfLines={1}>{user.position}</Text>
          ) : null}
          <Text style={[styles.cardName, blurred && { color: "rgba(255,255,255,0.25)" }]} numberOfLines={1}>
            {blurred ? "•••••" : user.name}
          </Text>
        </View>
        {!blurred && (
          <View style={styles.distanceBadge}>
            <Ionicons name="location" size={8} color="rgba(255,255,255,0.7)" />
            <Text style={styles.distanceText}>
              {user.isMe ? "you" : formatDistance(user.distanceMiles)}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

function FilterSheet({
  visible,
  onClose,
  filter,
  setFilter,
  positionFilters,
  setPositionFilters,
  lookingForFilters,
  setLookingForFilters,
  nearbyRadius,
  setNearbyRadius,
}: {
  visible: boolean;
  onClose: () => void;
  filter: FilterType;
  setFilter: (f: FilterType) => void;
  positionFilters: string[];
  setPositionFilters: React.Dispatch<React.SetStateAction<string[]>>;
  lookingForFilters: string[];
  setLookingForFilters: React.Dispatch<React.SetStateAction<string[]>>;
  nearbyRadius: number | null;
  setNearbyRadius: (r: number | null) => void;
}) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  React.useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 4,
        speed: 14,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  function togglePosition(pos: string) {
    Haptics.selectionAsync();
    setPositionFilters((prev) =>
      prev.includes(pos) ? prev.filter((p) => p !== pos) : [...prev, pos]
    );
  }

  function toggleLookingFor(lf: string) {
    Haptics.selectionAsync();
    setLookingForFilters((prev) =>
      prev.includes(lf) ? prev.filter((p) => p !== lf) : [...prev, lf]
    );
  }

  function clearAll() {
    Haptics.selectionAsync();
    setFilter("online");
    setPositionFilters([]);
    setLookingForFilters([]);
    setNearbyRadius(10);
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.sheetOverlay} onPress={onClose}>
        <Animated.View
          style={[styles.sheet, { paddingBottom: insets.bottom + 16, transform: [{ translateY: slideAnim }] }]}
        >
          <Pressable>
            {/* Drag handle */}
            <View style={styles.sheetHandle} />

            {/* Sheet header */}
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Filters</Text>
              <Pressable onPress={clearAll}>
                <Text style={styles.clearAllText}>Clear all</Text>
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
              {/* Online Status */}
              <Text style={styles.sectionLabel}>STATUS</Text>
              <View style={styles.pillRow}>
                <Pressable
                  style={[styles.pill, filter === "online" && styles.pillActiveGreen]}
                  onPress={() => { Haptics.selectionAsync(); setFilter("online"); }}
                >
                  <View style={styles.onlineDotSmall} />
                  <Text style={[styles.pillText, filter === "online" && styles.pillTextActive]}>Online only</Text>
                </Pressable>
                <Pressable
                  style={[styles.pill, filter === "all" && styles.pillActiveAccent]}
                  onPress={() => { Haptics.selectionAsync(); setFilter("all"); }}
                >
                  <Text style={[styles.pillText, filter === "all" && styles.pillTextActive]}>Everyone</Text>
                </Pressable>
              </View>

              {/* Position */}
              <Text style={styles.sectionLabel}>POSITION</Text>
              <View style={styles.pillRow}>
                {POSITIONS.map((pos) => {
                  const active = positionFilters.includes(pos);
                  return (
                    <Pressable
                      key={pos}
                      style={[styles.pill, active && styles.pillActiveAccent]}
                      onPress={() => togglePosition(pos)}
                    >
                      {active && <Ionicons name="checkmark" size={12} color="#fff" />}
                      <Text style={[styles.pillText, active && styles.pillTextActive]}>{pos}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Looking For */}
              <Text style={styles.sectionLabel}>LOOKING FOR</Text>
              <View style={styles.pillRow}>
                {LOOKING_FORS.map((lf) => {
                  const active = lookingForFilters.includes(lf);
                  return (
                    <Pressable
                      key={lf}
                      style={[styles.pill, active && styles.pillActivePurple]}
                      onPress={() => toggleLookingFor(lf)}
                    >
                      {active && <Ionicons name="checkmark" size={12} color="#fff" />}
                      <Text style={[styles.pillText, active && styles.pillTextActive]}>{lf}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Distance */}
              <Text style={styles.sectionLabel}>DISTANCE</Text>
              <View style={styles.pillRow}>
                {DISTANCE_OPTIONS.map(({ label, value }) => {
                  const active = nearbyRadius === value;
                  return (
                    <Pressable
                      key={label}
                      style={[styles.pill, active && styles.pillActiveAccent]}
                      onPress={() => { Haptics.selectionAsync(); setNearbyRadius(value); }}
                    >
                      {active && <Ionicons name="checkmark" size={12} color="#fff" />}
                      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            {/* Done button */}
            <Pressable style={styles.doneBtn} onPress={onClose}>
              <Text style={styles.doneBtnText}>Done</Text>
            </Pressable>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

export default function BrowseScreen() {
  const insets = useSafeAreaInsets();
  const { nearbyUsers, refreshNearbyUsers, isLoading, nearbyRadius, setNearbyRadius, isSetup } = useApp();
  const isGuest = !isSetup;
  const [filter, setFilter] = useState<FilterType>("online");
  const [positionFilters, setPositionFilters] = useState<string[]>([]);
  const [lookingForFilters, setLookingForFilters] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const filtered = nearbyUsers
    .filter((u) => filter === "online" ? u.isOnline : true)
    .filter((u) => positionFilters.length === 0 || positionFilters.includes(u.position))
    .filter((u) => lookingForFilters.length === 0 || lookingForFilters.includes(u.lookingFor ?? ""));

  async function handleRefresh() {
    setRefreshing(true);
    Haptics.selectionAsync();
    refreshNearbyUsers();
    setTimeout(() => setRefreshing(false), 800);
  }

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const radiusIsDefault = nearbyRadius === 5;
  const hasAnyFilter = positionFilters.length > 0 || lookingForFilters.length > 0 || !radiusIsDefault;
  const activeFilterCount =
    (filter === "online" ? 1 : 0) +
    positionFilters.length +
    lookingForFilters.length +
    (radiusIsDefault ? 0 : 1);
  const badgeCount = positionFilters.length + lookingForFilters.length + (filter === "all" ? 1 : 0) + (radiusIsDefault ? 0 : 1);

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>

      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Nearby</Text>
          <Text style={styles.headerSub}>Nearest first</Text>
        </View>
        <View style={styles.headerRight}>
          {badgeCount > 0 && (
            <Pressable
              style={styles.resetBtn}
              onPress={() => {
                Haptics.selectionAsync();
                setFilter("online");
                setPositionFilters([]);
                setLookingForFilters([]);
                setNearbyRadius(5);
              }}
            >
              <Ionicons name="close-circle" size={13} color={Colors.accent} />
              <Text style={styles.resetBtnText}>Reset</Text>
            </Pressable>
          )}
          <Pressable
            style={[styles.filterBtn, (hasAnyFilter || filter === "all") && styles.filterBtnActive]}
            onPress={() => {
              Haptics.selectionAsync();
              setShowFilters(true);
            }}
          >
            <Ionicons
              name="options-outline"
              size={20}
              color={(hasAnyFilter || filter === "all") ? Colors.accent : Colors.text}
            />
            {badgeCount > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{badgeCount}</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.accent} size="large" />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>No one nearby</Text>
          <Text style={styles.emptySub}>
            {hasAnyFilter
              ? "No users match those filters"
              : filter === "online"
              ? "No online users in your area"
              : "Try refreshing"}
          </Text>
          {hasAnyFilter ? (
            <Pressable
              style={styles.emptyRefreshBtn}
              onPress={() => { setPositionFilters([]); setLookingForFilters([]); setFilter("online"); setNearbyRadius(10); }}
            >
              <Text style={styles.emptyRefreshText}>Clear filters</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.emptyRefreshBtn} onPress={handleRefresh}>
              <Text style={styles.emptyRefreshText}>Refresh</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          numColumns={COLUMNS}
          contentContainerStyle={{
            paddingBottom: insets.bottom + (Platform.OS === "web" ? 84 : 90),
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.accent}
            />
          }
          renderItem={({ item }) => <UserCard user={item} isGuest={isGuest} />}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 2 }} />}
        />
      )}

      <FilterSheet
        visible={showFilters}
        onClose={() => setShowFilters(false)}
        filter={filter}
        setFilter={setFilter}
        positionFilters={positionFilters}
        setPositionFilters={setPositionFilters}
        lookingForFilters={lookingForFilters}
        setLookingForFilters={setLookingForFilters}
        nearbyRadius={nearbyRadius}
        setNearbyRadius={setNearbyRadius}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 24, fontWeight: "700", color: Colors.text, fontFamily: "Inter_700Bold",
  },
  headerSub: {
    fontSize: 11, color: Colors.textMuted, fontFamily: "Inter_400Regular", marginTop: 1,
  },
  headerRight: {
    flexDirection: "row", alignItems: "center", gap: 8,
  },
  resetBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1,
    borderColor: Colors.accent, backgroundColor: Colors.accentGlow,
  },
  resetBtnText: {
    fontSize: 12, color: Colors.accent, fontFamily: "Inter_600SemiBold",
  },
  filterBtn: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: Colors.bgCard, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: Colors.border,
  },
  filterBtnActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentGlow,
  },
  filterBadge: {
    position: "absolute", top: -4, right: -4,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: "#000",
  },
  filterBadgeText: {
    fontSize: 10, color: "#fff", fontFamily: "Inter_700Bold",
  },
  card: {
    width: CARD_SIZE, height: CARD_SIZE * 1.28,
    overflow: "hidden", marginRight: 2,
    position: "relative", backgroundColor: Colors.bgCard,
  },
  avatarLetter: { fontSize: 36, fontWeight: "700", color: "#fff", fontFamily: "Inter_700Bold" },
  cardGradient: { position: "absolute", bottom: 0, left: 0, right: 0, height: "60%" },
  onlineDot: {
    position: "absolute", top: 7, left: 7,
    width: 9, height: 9, borderRadius: 5,
    backgroundColor: Colors.online, borderWidth: 1.5, borderColor: "#000",
  },
  lastSeenBadge: {
    position: "absolute", top: 6, left: 6,
    backgroundColor: "rgba(0,0,0,0.62)", borderRadius: 6,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  lastSeenText: {
    fontSize: 9, color: "rgba(255,255,255,0.55)", fontFamily: "Inter_500Medium",
  },
  youBadge: {
    position: "absolute", bottom: 6, left: 7,
    backgroundColor: Colors.accent, borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  youBadgeText: { fontSize: 9, color: "#fff", fontFamily: "Inter_700Bold", letterSpacing: 0.8 },
  lockedBadge: {
    position: "absolute", top: 7, right: 7,
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "rgba(0,0,0,0.65)", borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 3,
  },
  lockedCount: { fontSize: 10, color: Colors.locked, fontFamily: "Inter_600SemiBold" },
  cardFooter: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    paddingHorizontal: 7, paddingBottom: 7,
    flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between",
  },
  cardFooterLeft: { flex: 1, flexDirection: "column", gap: 1 },
  positionLabel: {
    fontSize: 9, color: "rgba(255,255,255,0.72)", fontFamily: "Inter_500Medium",
    textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3, letterSpacing: 0.3,
  },
  cardName: {
    fontSize: 12, fontWeight: "700", color: "#fff", fontFamily: "Inter_700Bold",
    textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  distanceBadge: {
    flexDirection: "row", alignItems: "center", gap: 2,
    backgroundColor: "rgba(0,0,0,0.52)", borderRadius: 6,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  distanceText: { fontSize: 10, color: "rgba(255,255,255,0.85)", fontFamily: "Inter_500Medium" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 20, fontWeight: "600", color: Colors.text, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 14, color: Colors.textSecondary, textAlign: "center", fontFamily: "Inter_400Regular" },
  emptyRefreshBtn: {
    marginTop: 8, paddingHorizontal: 24, paddingVertical: 12,
    backgroundColor: Colors.accent, borderRadius: 12,
  },
  emptyRefreshText: { fontSize: 14, fontWeight: "600", color: "#fff", fontFamily: "Inter_600SemiBold" },

  // Guest mode
  guestBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: Colors.accentGlow,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.accent,
  },
  guestBannerText: {
    flex: 1, fontSize: 12, color: Colors.accent, fontFamily: "Inter_500Medium",
  },
  blurOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10,10,20,0.78)",
    alignItems: "center", justifyContent: "center",
  },

  // Filter sheet
  sheetOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#111", borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 12,
    maxHeight: SCREEN_HEIGHT * 0.82,
    borderWidth: 1, borderColor: "#222",
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: "#333", alignSelf: "center", marginBottom: 18,
  },
  sheetHeader: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 22,
  },
  sheetTitle: { fontSize: 18, fontWeight: "700", color: Colors.text, fontFamily: "Inter_700Bold" },
  clearAllText: { fontSize: 13, color: Colors.accent, fontFamily: "Inter_500Medium" },
  sectionLabel: {
    fontSize: 10, color: Colors.textMuted, fontFamily: "Inter_700Bold",
    letterSpacing: 1.2, marginBottom: 10, marginTop: 4,
  },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  pill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 22,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgCard,
  },
  pillActiveAccent: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  pillActiveGreen: { backgroundColor: Colors.online, borderColor: Colors.online },
  pillActivePurple: { backgroundColor: "#6C5CE7", borderColor: "#6C5CE7" },
  pillText: { fontSize: 13, color: Colors.textSecondary, fontFamily: "Inter_500Medium" },
  pillTextActive: { color: "#fff" },
  onlineDotSmall: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#fff" },
  doneBtn: {
    marginTop: 8, backgroundColor: Colors.accent,
    borderRadius: 14, paddingVertical: 15, alignItems: "center",
  },
  doneBtnText: { fontSize: 15, fontWeight: "700", color: "#fff", fontFamily: "Inter_700Bold" },
});
