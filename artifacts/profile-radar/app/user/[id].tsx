import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Alert,
  Platform,
  Dimensions,
  Modal,
  FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Colors } from "@/constants/colors";
import { useApp, NearbyUser } from "@/contexts/AppContext";
import { resolvePhotoUri } from "@/lib/api";
import { formatLastSeen } from "@/lib/time";
import PhotoViewer from "@/components/PhotoViewer";

function formatDistance(miles: number): string {
  const feet = Math.round(miles * 5280);
  if (feet < 5280) return `${feet} ft`;
  return `${miles.toFixed(1)} mi`;
}

const { width, height: SCREEN_HEIGHT } = Dimensions.get("window");
const PHOTO_HEIGHT = SCREEN_HEIGHT * 0.68;

function UnlockModal({
  visible,
  user,
  onClose,
  onUnlock,
}: {
  visible: boolean;
  user: NearbyUser;
  onClose: () => void;
  onUnlock: () => void;
}) {
  const lockedCount = user.photos.filter((p) => p.isLocked).length;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <View style={styles.modalCard}>
          <View style={styles.modalIconWrap}>
            <Ionicons name="lock-open-outline" size={32} color={Colors.locked} />
          </View>
          <Text style={styles.modalTitle}>Unlock {user.name}'s Photos</Text>
          <Text style={styles.modalSub}>
            Request access to {user.name}'s {lockedCount} locked photo{lockedCount !== 1 ? "s" : ""}.
          </Text>
          <Pressable style={styles.unlockBtn} onPress={() => { onUnlock(); onClose(); }}>
            <Ionicons name="lock-open" size={17} color="#fff" />
            <Text style={styles.unlockBtnText}>Request Unlock</Text>
          </Pressable>
          <Pressable style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

function GrantModal({
  visible,
  userName,
  onClose,
  onGrant,
}: {
  visible: boolean;
  userName: string;
  onClose: () => void;
  onGrant: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <View style={styles.modalCard}>
          <View style={[styles.modalIconWrap, { backgroundColor: Colors.onlineGlow }]}>
            <Ionicons name="eye-outline" size={32} color={Colors.online} />
          </View>
          <Text style={styles.modalTitle}>Share Your Locked Photos</Text>
          <Text style={styles.modalSub}>
            Allow {userName} to view your locked photos?
          </Text>
          <Pressable
            style={[styles.unlockBtn, { backgroundColor: Colors.online }]}
            onPress={() => { onGrant(); onClose(); }}
          >
            <Ionicons name="checkmark" size={17} color="#fff" />
            <Text style={styles.unlockBtnText}>Grant Access</Text>
          </Pressable>
          <Pressable style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

export default function UserDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { nearbyUsers, isSetup, hasUnlocked, hasGrantedUnlock, canSeeLockedPhotos, requestUnlock, grantUnlock, recordProfileView, addToHotStuff, isHotStuff } = useApp();
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerStart, setViewerStart] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const realIndexRef = useRef(0);

  const user = nearbyUsers.find((u) => u.id === id);

  useEffect(() => {
    if (user && !user.isMe && isSetup) {
      recordProfileView(user.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (!user) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>User not found</Text>
        <Pressable style={styles.backBtnAlt} onPress={() => router.back()}>
          <Text style={styles.backBtnAltText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const publicPhotos = user.photos.filter((p) => !p.isLocked);
  const lockedPhotos = user.photos.filter((p) => p.isLocked);
  const allPhotos = [...publicPhotos, ...lockedPhotos];
  const alreadyUnlocked = hasUnlocked(user.id);
  const alreadyGranted = hasGrantedUnlock(user.id);
  const canSeeAll = canSeeLockedPhotos(user.id);
  const viewerPhotos = canSeeAll ? allPhotos : publicPhotos;

  // Circular carousel: wrap with clones of last/first
  const carouselCount = viewerPhotos.length;
  const extendedCarousel = carouselCount > 1
    ? [viewerPhotos[carouselCount - 1], ...viewerPhotos, viewerPhotos[0]]
    : viewerPhotos;
  const carouselStartOffset = carouselCount > 1 ? 1 : 0;

  const onCarouselScrollEnd = useCallback((e: { nativeEvent: { contentOffset: { x: number } } }) => {
    if (carouselCount <= 1) return;
    const rawIndex = Math.round(e.nativeEvent.contentOffset.x / width);
    let realIdx: number;
    if (rawIndex === 0) {
      flatListRef.current?.scrollToIndex({ index: carouselCount, animated: false });
      realIdx = carouselCount - 1;
    } else if (rawIndex === carouselCount + 1) {
      flatListRef.current?.scrollToIndex({ index: 1, animated: false });
      realIdx = 0;
    } else {
      realIdx = rawIndex - 1;
    }
    realIndexRef.current = realIdx;
    setActivePhotoIndex(realIdx);
  }, [carouselCount]);

  const fallbackColors = ["#FF7A00", "#6C5CE7", "#00B4D8", "#06D6A0", "#FFB703", "#FB8500"];
  const fallbackColor = fallbackColors[user.name.charCodeAt(0) % fallbackColors.length];

  const timeAgo = formatLastSeen(user.lastSeen, user.isOnline);

  function promptCreateProfile() {
    Alert.alert(
      "Create a profile",
      "Set up your profile to interact with other users.",
      [
        { text: "Not now", style: "cancel" },
        { text: "Create", onPress: () => router.push("/setup") },
      ]
    );
  }

  async function handleUnlockRequest() {
    if (!isSetup) {
      promptCreateProfile();
      return;
    }
    await requestUnlock(user!.id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Request Sent", `You've requested access to ${user!.name}'s locked photos.`);
  }

  async function handleGrantAccess() {
    if (!isSetup) {
      promptCreateProfile();
      return;
    }
    await grantUnlock(user!.id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Access Granted", `${user!.name} can now see your locked photos.`);
  }

  const topInset = insets.top + (Platform.OS === "web" ? 67 : 0);

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces={true}
        contentContainerStyle={{ paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 32) }}
      >
        {/* Main photo area */}
        <View style={{ height: PHOTO_HEIGHT }}>
          {carouselCount > 0 ? (
            <FlatList
              ref={flatListRef}
              data={extendedCarousel}
              keyExtractor={(_, i) => String(i)}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              bounces={false}
              scrollEventThrottle={16}
              initialScrollIndex={carouselStartOffset}
              getItemLayout={(_, index) => ({
                length: width,
                offset: width * index,
                index,
              })}
              onMomentumScrollEnd={onCarouselScrollEnd}
              renderItem={({ item }) => (
                <Pressable
                  style={{ width, height: PHOTO_HEIGHT }}
                  onPress={() => {
                    setViewerStart(activePhotoIndex);
                    setViewerOpen(true);
                  }}
                >
                  <Image
                    source={{ uri: resolvePhotoUri(item.uri) }}
                    style={{ width, height: PHOTO_HEIGHT }}
                    resizeMode="cover"
                  />
                </Pressable>
              )}
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: fallbackColor, alignItems: "center", justifyContent: "center" }]}>
              <Text style={{ fontSize: 80, fontWeight: "700", color: "#fff", fontFamily: "Inter_700Bold" }}>{user.name[0]}</Text>
            </View>
          )}

          {/* Gradient overlay at bottom */}
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.35)", "rgba(0,0,0,0.88)"]}
            style={styles.photoGradient}
            locations={[0.35, 0.65, 1]}
            pointerEvents="none"
          />

          {/* Horizontal dots row — top center */}
          {carouselCount > 1 && (
            <View style={[styles.dotsRow, { top: topInset + 14 }]} pointerEvents="none">
              {viewerPhotos.map((_, i) => (
                <View key={i} style={[styles.dotH, i === activePhotoIndex && styles.dotHActive]} />
              ))}
            </View>
          )}

          {/* Photo count badge — top right (only when multiple photos) */}
          {carouselCount > 1 && (
            <View style={[styles.photoCountBadge, { top: topInset + 8 }]} pointerEvents="none">
              <Ionicons name="images-outline" size={12} color="#fff" />
              <Text style={styles.photoCountText}>{activePhotoIndex + 1}/{carouselCount}</Text>
            </View>
          )}

          {/* Right side panel — action buttons only */}
          <View style={[styles.rightPanel, { top: topInset + 8 }]}>
            <View style={{ flex: 1 }} />
            {!user.isMe && (
              <>
                <Pressable
                  style={styles.sideAction}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setShowGrantModal(true);
                  }}
                >
                  <Ionicons name="happy-outline" size={28} color={alreadyGranted ? Colors.online : Colors.text} />
                </Pressable>
                <Pressable
                  style={styles.sideAction}
                  onPress={() => {
                    if (!isSetup) { promptCreateProfile(); return; }
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    if (!isHotStuff(user.id)) {
                      addToHotStuff(user.id);
                      Alert.alert("Hot Stuff 🔥", `${user.name} has been added to your Hot Stuff list!`);
                    } else {
                      Alert.alert("Already in Hot Stuff", `${user.name} is already in your Hot Stuff list.`);
                    }
                  }}
                >
                  <Ionicons name={isHotStuff(user.id) ? "star" : "star-outline"} size={28} color={Colors.locked} />
                </Pressable>
                <Text style={styles.moreLabel}>MORE</Text>
              </>
            )}
          </View>

          {/* Bottom name + chat row */}
          <View style={styles.photoBottom} pointerEvents="box-none">
            <View style={styles.photoBottomLeft}>
              <View style={styles.nameRow}>
                <View style={[styles.onlineDot, user.isOnline && styles.onlineDotActive]} />
                <Text style={styles.userName}>{user.name}</Text>
              </View>
              {user.age ? (
                <Text style={styles.userAge}>{user.age} years old</Text>
              ) : null}
              {!user.isMe && user.position ? (
                <View style={styles.positionBadge}>
                  <Text style={styles.positionBadgeText}>{user.position}</Text>
                </View>
              ) : null}
            </View>
            {user.isMe ? (
              <View style={styles.youTag}>
                <Text style={styles.youTagText}>You</Text>
              </View>
            ) : (
              <Pressable
                style={styles.chatBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push({ pathname: "/chat/[id]", params: { id: user.id } });
                }}
              >
                <Ionicons name="chatbubble-outline" size={24} color={Colors.accent} />
              </Pressable>
            )}
          </View>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Distance</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="navigate-outline" size={13} color={Colors.textMuted} />
              <Text style={styles.statValue}>
                {user.isMe
                  ? "Your location"
                  : formatDistance(user.distanceMiles) + " away"}
              </Text>
            </View>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Last seen</Text>
            <Text style={styles.statValue}>{timeAgo}</Text>
          </View>
        </View>

        {/* What they're into */}
        {user.into ? (
          <View style={styles.bioSection}>
            <View style={styles.tagRow}>
              {user.into.split(",").map((tag) => (
                <View key={tag.trim()} style={styles.tag}>
                  <Text style={styles.tagText}>{tag.trim()}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Details */}
        <View style={styles.detailsSection}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Position</Text>
            {user.position ? (
              <View style={styles.positionDetailBadge}>
                <Text style={styles.positionDetailBadgeText}>{user.position}</Text>
              </View>
            ) : (
              <Text style={styles.detailValue}>—</Text>
            )}
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Body</Text>
            <Text style={styles.detailValue}>{user.bodyType || "—"}</Text>
          </View>
          {!!user.endowment && (
            <>
              <View style={styles.detailDivider} />
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Endowment</Text>
                <Text style={styles.detailValue}>{user.endowment}</Text>
              </View>
            </>
          )}
          {!!user.cockSize && (
            <>
              <View style={styles.detailDivider} />
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Size</Text>
                <View style={styles.detailValueRow}>
                  <MaterialCommunityIcons name="ruler" size={14} color={Colors.textMuted} style={{ marginRight: 4 }} />
                  <Text style={styles.detailValue}>{user.cockSize}"</Text>
                </View>
              </View>
            </>
          )}
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Available</Text>
            <Text style={styles.detailValue}>{user.lookingFor || "—"}</Text>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Hosting</Text>
            <Text style={styles.detailValue}>{user.hosting || "—"}</Text>
          </View>
        </View>

        {/* Locked photos section */}
        {lockedPhotos.length > 0 && (
          <View style={styles.lockedSection}>
            <View style={styles.lockedSectionHeader}>
              <Ionicons name="lock-closed" size={14} color={Colors.locked} />
              <Text style={styles.lockedSectionTitle}>
                {lockedPhotos.length} Locked Photo{lockedPhotos.length !== 1 ? "s" : ""}
              </Text>
            </View>

            {canSeeAll ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.lockedScroll}
              >
                {lockedPhotos.map((photo, i) => {
                  const viewerIdx = publicPhotos.length + i;
                  return (
                    <Pressable
                      key={i}
                      onPress={() => {
                        setViewerStart(viewerIdx);
                        setViewerOpen(true);
                      }}
                    >
                      <View style={styles.lockedThumbWrap}>
                        <Image
                          source={{ uri: resolvePhotoUri(photo.uri) }}
                          style={styles.lockedThumb}
                          resizeMode="cover"
                        />
                        <View style={styles.lockedThumbBadge}>
                          <Ionicons name="lock-open" size={10} color="#fff" />
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : (
              /* Locked placeholder — enticing stacked-card visual */
              <Pressable
                style={styles.lockedCTA}
                onPress={() => !alreadyUnlocked && setShowUnlockModal(true)}
                disabled={alreadyUnlocked}
              >
                <View style={styles.lockedCTAStack}>
                  {Array.from({ length: Math.min(lockedPhotos.length, 3) }).map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.lockedCTACard,
                        {
                          transform: [{ rotate: `${(i - 1) * 5}deg` }],
                          zIndex: 3 - i,
                          backgroundColor: i === 0
                            ? "rgba(255,61,107,0.18)"
                            : i === 1
                            ? "rgba(255,61,107,0.10)"
                            : "rgba(255,61,107,0.05)",
                        },
                      ]}
                    >
                      <Ionicons name="lock-closed" size={18} color={Colors.locked} />
                    </View>
                  ))}
                </View>
                <View style={styles.lockedCTABody}>
                  {alreadyUnlocked ? (
                    <>
                      <Text style={styles.lockedCTATitle}>Request Sent</Text>
                      <Text style={styles.lockedCTASub}>Waiting for {user.name} to approve…</Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.lockedCTATitle}>
                        {lockedPhotos.length} Locked Photo{lockedPhotos.length !== 1 ? "s" : ""}
                      </Text>
                      <Text style={styles.lockedCTASub}>Request access to unlock</Text>
                    </>
                  )}
                </View>
                {!alreadyUnlocked && (
                  <View style={styles.lockedCTABtn}>
                    <Text style={styles.lockedCTABtnText}>Unlock</Text>
                  </View>
                )}
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>

      {/* Back button */}
      <View style={[styles.topBar, { paddingTop: topInset + 8 }]} pointerEvents="box-none">
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </Pressable>
      </View>

      <UnlockModal
        visible={showUnlockModal}
        user={user}
        onClose={() => setShowUnlockModal(false)}
        onUnlock={handleUnlockRequest}
      />
      <GrantModal
        visible={showGrantModal}
        userName={user.name}
        onClose={() => setShowGrantModal(false)}
        onGrant={handleGrantAccess}
      />
      <PhotoViewer
        visible={viewerOpen}
        photos={viewerPhotos}
        initialIndex={viewerStart}
        onClose={() => setViewerOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  centered: { alignItems: "center", justifyContent: "center", flex: 1 },
  errorText: { fontSize: 18, color: Colors.textSecondary, fontFamily: "Inter_400Regular" },
  backBtnAlt: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: Colors.bgCard, borderRadius: 12 },
  backBtnAltText: { fontSize: 14, color: Colors.text, fontFamily: "Inter_500Medium" },

  photoGradient: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    height: "55%",
  },

  rightPanel: {
    position: "absolute", right: 0, bottom: 0,
    width: 52, alignItems: "center",
    paddingVertical: 12, gap: 10,
    backgroundColor: "rgba(0,0,0,0.52)",
    top: 0,
  },
  dotsRow: {
    position: "absolute",
    left: 0, right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 60,
    flexWrap: "wrap",
  },
  photoCountBadge: {
    position: "absolute",
    right: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
  },
  photoCountText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  dotH: {
    flex: 1,
    maxWidth: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  dotHActive: {
    backgroundColor: "#fff",
  },
  sideAction: {
    width: 50, height: 50, borderRadius: 25,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  moreLabel: {
    fontSize: 9, color: Colors.locked, fontFamily: "Inter_700Bold",
    letterSpacing: 0.5, marginBottom: 8,
  },

  photoBottom: {
    position: "absolute", bottom: 16, left: 16, right: 60,
    flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between",
  },
  photoBottomLeft: {
    flex: 1,
    flexDirection: "column",
    gap: 6,
  },
  positionBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: "rgba(255,61,107,0.22)",
    borderWidth: 1,
    borderColor: "rgba(255,61,107,0.5)",
  },
  positionBadgeText: {
    fontSize: 11,
    color: Colors.accent,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },
  positionDetailBadge: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: Colors.accentGlow,
    borderWidth: 1,
    borderColor: "rgba(255,61,107,0.35)",
  },
  positionDetailBadgeText: {
    fontSize: 13,
    color: Colors.accent,
    fontFamily: "Inter_600SemiBold",
  },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  userAge: {
    fontSize: 15, color: "rgba(255,255,255,0.8)",
    fontFamily: "Inter_400Regular",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  onlineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.textMuted },
  onlineDotActive: { backgroundColor: Colors.online },
  userName: {
    fontSize: 22, fontWeight: "700", color: "#fff",
    fontFamily: "Inter_700Bold",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  chatBtn: {
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderWidth: 1.5, borderColor: Colors.accent,
    alignItems: "center", justifyContent: "center",
  },
  youTag: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 12, backgroundColor: "rgba(255,61,107,0.18)",
    borderWidth: 1, borderColor: Colors.accent,
  },
  youTagText: {
    fontSize: 12, color: Colors.accent,
    fontFamily: "Inter_600SemiBold", letterSpacing: 0.5,
  },

  statsRow: {
    flexDirection: "row", alignItems: "stretch",
    backgroundColor: "#0A0A0A", paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: "#1A1A1A",
  },
  statItem: { flex: 1, alignItems: "center", gap: 3 },
  statLabel: { fontSize: 11, color: Colors.accent, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  statValue: { fontSize: 13, color: Colors.text, fontFamily: "Inter_400Regular" },
  statDivider: { width: 1, backgroundColor: "#1A1A1A" },

  bioSection: {
    paddingHorizontal: 20, paddingVertical: 18,
    borderBottomWidth: 1, borderBottomColor: "#1A1A1A",
    backgroundColor: "#0A0A0A",
  },
  bioText: { fontSize: 15, color: Colors.text, fontFamily: "Inter_400Regular", lineHeight: 22 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { backgroundColor: "#1A1A1A", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: "#2A2A2A" },
  tagText: { fontSize: 13, color: Colors.text, fontFamily: "Inter_500Medium" },

  detailsSection: { backgroundColor: "#0A0A0A", paddingHorizontal: 20 },
  detailRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14 },
  detailLabel: { fontSize: 13, color: Colors.accent, fontFamily: "Inter_600SemiBold" },
  detailValue: { fontSize: 14, color: Colors.text, fontFamily: "Inter_400Regular" },
  detailValueRow: { flexDirection: "row", alignItems: "center" },
  detailDivider: { height: 1, backgroundColor: "#1A1A1A" },

  lockedSection: {
    backgroundColor: "#0A0A0A", marginTop: 2,
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 20,
  },
  lockedSectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  lockedSectionTitle: { fontSize: 14, fontWeight: "600", color: Colors.locked, fontFamily: "Inter_600SemiBold" },
  lockedScroll: { gap: 10, paddingVertical: 4 },
  lockedThumbWrap: { position: "relative" },
  lockedThumb: { width: 100, height: 130, borderRadius: 12 },
  lockedThumbBadge: {
    position: "absolute", bottom: 6, right: 6,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.online, alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: "#000",
  },

  lockedCTA: {
    flexDirection: "row", alignItems: "center", gap: 16,
    backgroundColor: Colors.bgCard, borderRadius: 16,
    borderWidth: 1, borderColor: "rgba(255,61,107,0.2)", padding: 16,
  },
  lockedCTAStack: {
    width: 60, height: 76, position: "relative",
    alignItems: "center", justifyContent: "center",
  },
  lockedCTACard: {
    position: "absolute",
    width: 46, height: 62, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,61,107,0.3)",
  },
  lockedCTABody: { flex: 1 },
  lockedCTATitle: {
    fontSize: 14, fontWeight: "600", color: Colors.locked,
    fontFamily: "Inter_600SemiBold", marginBottom: 3,
  },
  lockedCTASub: {
    fontSize: 12, color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
  },
  lockedCTABtn: {
    backgroundColor: Colors.accent, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  lockedCTABtnText: {
    fontSize: 13, color: "#fff",
    fontFamily: "Inter_600SemiBold",
  },

  topBar: {
    position: "absolute", top: 0, left: 0, right: 0,
    paddingHorizontal: 14, pointerEvents: "box-none",
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center",
  },

  modalOverlay: {
    flex: 1, backgroundColor: Colors.overlay,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: Colors.bgCard, borderRadius: 24, padding: 28,
    alignItems: "center", width: "100%", borderWidth: 1, borderColor: Colors.border,
  },
  modalIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.lockedGlow, alignItems: "center",
    justifyContent: "center", marginBottom: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: "700", color: Colors.text, fontFamily: "Inter_700Bold", marginBottom: 10, textAlign: "center" },
  modalSub: { fontSize: 14, color: Colors.textSecondary, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20, marginBottom: 24 },
  unlockBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.locked, width: "100%",
    paddingVertical: 14, borderRadius: 14, justifyContent: "center",
  },
  unlockBtnText: { fontSize: 15, fontWeight: "600", color: "#fff", fontFamily: "Inter_600SemiBold" },
  cancelBtn: { marginTop: 12, paddingVertical: 10 },
  cancelBtnText: { fontSize: 14, color: Colors.textSecondary, fontFamily: "Inter_500Medium" },
});
