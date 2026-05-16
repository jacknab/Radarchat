import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { Colors } from "@/constants/colors";
import { MAX_PUBLIC_PHOTOS, MAX_LOCKED_PHOTOS } from "@/constants/photos";
import { useApp, Photo, AppNotification } from "@/contexts/AppContext";
import { resolvePhotoUri } from "@/lib/api";
import ReorderPhotosModal from "@/components/ReorderPhotosModal";

const SCREEN_WIDTH = Dimensions.get("window").width;
const HERO_HEIGHT = Math.round(SCREEN_WIDTH * 1.05);

const FALLBACK_COLORS = ["#FF7A00", "#6C5CE7", "#00B4D8", "#06D6A0", "#FFB703", "#FB8500"];
function fallbackColorFor(name: string) {
  if (!name) return Colors.textMuted;
  return FALLBACK_COLORS[name.charCodeAt(0) % FALLBACK_COLORS.length];
}
function relativeTime(ts: number) {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function ActivityRow({ notif }: { notif: AppNotification }) {
  const isView = notif.type === "profile_view";
  const badgeColor = isView ? Colors.accent : "#FF6B35";
  const icon = isView ? "eye" : "flame";
  const subText = isView ? "viewed your profile" : "added you to Hot Stuff";
  const displayName = notif.senderName || "Someone nearby";
  return (
    <Pressable
      style={({ pressed }) => [actStyles.row, pressed && { opacity: 0.75 }]}
      onPress={() => {
        Haptics.selectionAsync();
        router.push(`/user/${notif.senderId}` as never);
      }}
    >
      <View style={actStyles.avatarWrap}>
        {notif.senderPhotoUri ? (
          <Image source={{ uri: resolvePhotoUri(notif.senderPhotoUri) }} style={actStyles.avatar} resizeMode="cover" />
        ) : (
          <View style={[actStyles.avatar, { backgroundColor: fallbackColorFor(displayName), alignItems: "center", justifyContent: "center" }]}>
            <Text style={actStyles.avatarLetter}>{displayName[0] ?? "?"}</Text>
          </View>
        )}
        <View style={[actStyles.badge, { backgroundColor: badgeColor }]}>
          <Ionicons name={icon as never} size={9} color="#fff" />
        </View>
      </View>
      <View style={actStyles.body}>
        <Text style={actStyles.name} numberOfLines={1}>{displayName}</Text>
        <Text style={actStyles.sub} numberOfLines={1}>{subText}</Text>
      </View>
      <Text style={actStyles.time}>{relativeTime(notif.createdAt)}</Text>
      {!notif.read && <View style={actStyles.unreadDot} />}
    </Pressable>
  );
}

const actStyles = StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 10, paddingHorizontal: 20,
  },
  avatarWrap: { position: "relative" },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarLetter: { fontSize: 18, fontWeight: "700", color: "#fff", fontFamily: "Inter_700Bold" },
  badge: {
    position: "absolute", bottom: -2, left: -2,
    width: 17, height: 17, borderRadius: 9,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: Colors.bg,
  },
  body: { flex: 1 },
  name: { fontSize: 14, fontWeight: "600", color: Colors.text, fontFamily: "Inter_600SemiBold" },
  sub: { fontSize: 12, color: Colors.textSecondary, fontFamily: "Inter_400Regular", marginTop: 1 },
  time: { fontSize: 11, color: Colors.textMuted, fontFamily: "Inter_400Regular" },
  unreadDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: Colors.accent, marginLeft: 4,
  },
});

function PhotoGrid() {
  const { myProfile, addPhoto, removePhoto, togglePhotoLock, reorderPhotosWithinGallery, setMainPhoto } = useApp();
  const [adding, setAdding] = useState<"public" | "locked" | null>(null);
  const [reorderingGallery, setReorderingGallery] = useState<"public" | "locked" | null>(null);

  const allPhotos = myProfile?.photos ?? [];
  const publicPhotos = allPhotos.filter((p) => !p.isLocked);
  const lockedPhotos = allPhotos.filter((p) => p.isLocked);
  const mainPhotoId = publicPhotos[0]?.id ?? null;
  const publicFull = publicPhotos.length >= MAX_PUBLIC_PHOTOS;
  const lockedFull = lockedPhotos.length >= MAX_LOCKED_PHOTOS;

  async function pickPhoto(isLocked: boolean) {
    if (isLocked && lockedFull) {
      Alert.alert(
        "Locked gallery full",
        `You can have up to ${MAX_LOCKED_PHOTOS} locked photos. Remove one to add another.`,
      );
      return;
    }
    if (!isLocked && publicFull) {
      Alert.alert(
        "Public gallery full",
        `You can have up to ${MAX_PUBLIC_PHOTOS} public photos. Remove one to add another.`,
      );
      return;
    }
    setAdding(isLocked ? "locked" : "public");
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission Required", "Please allow photo library access.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        allowsEditing: true,
        aspect: [3, 4],
        base64: true,
      });
      if (!result.canceled && result.assets[0]) {
        try {
          await addPhoto(result.assets[0].uri, isLocked, result.assets[0].base64 ?? null);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (e: any) {
          Alert.alert("Upload failed", e?.message ?? "Could not upload photo. Please try again.");
        }
      }
    } finally {
      setAdding(null);
    }
  }

  function confirmRemove(photo: Photo) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("Remove Photo", "Are you sure you want to delete this photo?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => removePhoto(photo.id),
      },
    ]);
  }

  function openPhotoActions(photo: Photo) {
    Haptics.selectionAsync();
    const isMain = photo.id === mainPhotoId;
    const buttons: { text: string; onPress?: () => void; style?: "default" | "cancel" | "destructive" }[] = [];
    if (!photo.isLocked && !isMain) {
      buttons.push({ text: "Set as Main", onPress: () => setMainPhoto(photo.id) });
    }
    const wouldBecomePublic = photo.isLocked;
    const blockedByCap =
      (wouldBecomePublic && publicFull) || (!wouldBecomePublic && lockedFull);
    if (!blockedByCap) {
      buttons.push({
        text: photo.isLocked ? "Make Public" : "Make Locked",
        onPress: () => togglePhotoLock(photo.id),
      });
    }
    buttons.push({ text: "Remove", style: "destructive", onPress: () => confirmRemove(photo) });
    buttons.push({ text: "Cancel", style: "cancel" });
    Alert.alert("Photo Options", isMain ? "This is your main photo." : undefined, buttons);
  }

  function PhotoItem({ photo }: { photo: Photo }) {
    const isMain = photo.id === mainPhotoId;
    return (
      <Pressable
        style={styles.photoItem}
        onPress={() => openPhotoActions(photo)}
        onLongPress={() => confirmRemove(photo)}
      >
        <Image source={{ uri: resolvePhotoUri(photo.uri) }} style={styles.photoImage} resizeMode="cover" />
        {isMain ? (
          <View style={styles.mainBadge}>
            <Ionicons name="star" size={10} color="#fff" />
            <Text style={styles.mainBadgeText}>Main</Text>
          </View>
        ) : null}
        <Pressable
          style={styles.photoRemoveBtn}
          onPress={(e) => {
            e.stopPropagation();
            confirmRemove(photo);
          }}
        >
          <Ionicons name="close-circle" size={20} color="#fff" />
        </Pressable>
      </Pressable>
    );
  }

  function AddPhotoBtn({ isLocked, loading }: { isLocked: boolean; loading: boolean }) {
    const full = isLocked ? lockedFull : publicFull;
    const tint = isLocked ? Colors.locked : Colors.accent;
    return (
      <Pressable
        style={[styles.addPhotoBtn, full && styles.addPhotoBtnDisabled]}
        onPress={() => pickPhoto(isLocked)}
        disabled={full || loading}
      >
        {loading ? (
          <ActivityIndicator color={tint} size="small" />
        ) : (
          <>
            <Ionicons
              name={full ? "checkmark-circle" : "add"}
              size={24}
              color={full ? Colors.textSecondary : tint}
            />
            <Text
              style={[
                styles.addPhotoBtnText,
                isLocked && { color: Colors.locked },
                full && { color: Colors.textSecondary },
              ]}
            >
              {full ? "Full" : isLocked ? "Add Locked" : "Add Photo"}
            </Text>
          </>
        )}
      </Pressable>
    );
  }

  return (
    <View>
      <View style={styles.photoSectionHeader}>
        <Ionicons name="images" size={16} color={Colors.textSecondary} />
        <Text style={styles.photoSectionTitle}>Public Photos</Text>
        <Text style={styles.photoSectionCount}>{publicPhotos.length} / {MAX_PUBLIC_PHOTOS}</Text>
        {publicPhotos.length > 1 ? (
          <Pressable
            onPress={() => setReorderingGallery("public")}
            style={styles.reorderBtn}
            hitSlop={6}
          >
            <Ionicons name="swap-vertical" size={14} color={Colors.accent} />
            <Text style={[styles.reorderBtnText, { color: Colors.accent }]}>Reorder</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.photoGrid}>
        {publicPhotos.map((p) => <PhotoItem key={p.id} photo={p} />)}
        <AddPhotoBtn isLocked={false} loading={adding === "public"} />
      </View>

      <View style={[styles.photoSectionHeader, { marginTop: 24 }]}>
        <Ionicons name="lock-closed" size={16} color={Colors.locked} />
        <Text style={[styles.photoSectionTitle, { color: Colors.locked }]}>Locked Photos</Text>
        <Text style={styles.photoSectionCount}>{lockedPhotos.length} / {MAX_LOCKED_PHOTOS}</Text>
        {lockedPhotos.length > 1 ? (
          <Pressable
            onPress={() => setReorderingGallery("locked")}
            style={styles.reorderBtn}
            hitSlop={6}
          >
            <Ionicons name="swap-vertical" size={14} color={Colors.locked} />
            <Text style={[styles.reorderBtnText, { color: Colors.locked }]}>Reorder</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.lockedHint}>These are hidden from others unless you unlock them</Text>
      <View style={styles.photoGrid}>
        {lockedPhotos.map((p) => (
          <Pressable
            key={p.id}
            style={styles.photoItem}
            onPress={() => openPhotoActions(p)}
            onLongPress={() => confirmRemove(p)}
          >
            <View style={[StyleSheet.absoluteFill, styles.lockedOverlay]}>
              <Ionicons name="lock-closed" size={22} color={Colors.locked} />
            </View>
            <Image source={{ uri: resolvePhotoUri(p.uri) }} style={[styles.photoImage, { opacity: 0.4 }]} resizeMode="cover" />
            <Pressable
              style={styles.photoRemoveBtn}
              onPress={(e) => {
                e.stopPropagation();
                confirmRemove(p);
              }}
            >
              <Ionicons name="close-circle" size={20} color="#fff" />
            </Pressable>
          </Pressable>
        ))}
        <AddPhotoBtn isLocked={true} loading={adding === "locked"} />
      </View>
      <Text style={styles.tipText}>
        Tap a photo to set as main or change its status. Use Reorder to drag photos into a new order.
      </Text>

      <ReorderPhotosModal
        visible={reorderingGallery === "public"}
        isLocked={false}
        photos={publicPhotos}
        onClose={() => setReorderingGallery(null)}
        onSave={(orderedIds) => reorderPhotosWithinGallery(false, orderedIds)}
      />
      <ReorderPhotosModal
        visible={reorderingGallery === "locked"}
        isLocked={true}
        photos={lockedPhotos}
        onClose={() => setReorderingGallery(null)}
        onSave={(orderedIds) => reorderPhotosWithinGallery(true, orderedIds)}
      />
    </View>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { myProfile, isSetup, isLive, goLive, goOffline, deleteMyProfile } = useApp();
  const [deleting, setDeleting] = useState(false);
  const [togglingLive, setTogglingLive] = useState(false);
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const publicPhotos = myProfile?.photos?.filter((p) => !p.isLocked) ?? [];
  const lockedPhotos = myProfile?.photos?.filter((p) => p.isLocked) ?? [];
  const coverPhoto = publicPhotos[0];
  const fallbackColor = myProfile?.name ? fallbackColorFor(myProfile.name) : Colors.accent;

  async function handleToggleLive() {
    setTogglingLive(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      if (isLive) await goOffline();
      else await goLive();
    } finally {
      setTogglingLive(false);
    }
  }

  function confirmDeleteProfile() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      "Delete Profile?",
      "This permanently removes your profile, photos, messages, blocks, hot list, and unlock requests. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteMyProfile();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.replace("/setup");
            } catch (e: any) {
              Alert.alert("Could not delete profile", e?.message ?? "Please try again.");
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  }

  if (!isSetup) {
    return (
      <View style={[styles.container, { paddingTop: topPad }, styles.centered]}>
        <Ionicons name="person-circle-outline" size={72} color={Colors.textMuted} />
        <Text style={styles.noProfileTitle}>No Profile Yet</Text>
        <Text style={styles.noProfileSub}>Set up your profile to appear on the radar</Text>
        <Pressable style={styles.setupBtn} onPress={() => router.push("/setup")}>
          <Text style={styles.setupBtnText}>Create Profile</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + (Platform.OS === "web" ? 84 : 90) }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Hero ─────────────────────────────────────────────── */}
      <View style={[styles.hero, { height: HERO_HEIGHT + topPad }]}>
        {coverPhoto ? (
          <Image
            source={{ uri: resolvePhotoUri(coverPhoto.uri) }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: fallbackColor, alignItems: "center", justifyContent: "center" }]}>
            <Text style={styles.heroFallbackLetter}>{myProfile?.name?.[0] ?? "?"}</Text>
          </View>
        )}

        <LinearGradient
          colors={["rgba(0,0,0,0.25)", "transparent", "rgba(0,0,0,0.55)", "rgba(0,0,0,0.92)"]}
          locations={[0, 0.25, 0.65, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* Top row: status chip + edit button */}
        <View style={[styles.heroTopRow, { paddingTop: topPad + 12 }]}>
          <View style={[styles.liveChip, isLive ? styles.liveChipOn : styles.liveChipOff]}>
            <View style={[styles.liveDot, { backgroundColor: isLive ? Colors.online : Colors.textMuted }]} />
            <Text style={[styles.liveChipText, { color: isLive ? Colors.online : Colors.textMuted }]}>
              {isLive ? "Live" : "Offline"}
            </Text>
          </View>
          <Pressable
            style={styles.heroEditBtn}
            onPress={() => { Haptics.selectionAsync(); router.push("/setup"); }}
          >
            <Ionicons name="pencil" size={17} color="#fff" />
          </Pressable>
        </View>

        {/* Bottom: name + position */}
        <View style={styles.heroBottom}>
          <View style={styles.heroNameRow}>
            <Text style={styles.heroName}>{myProfile?.name}</Text>
            <Text style={styles.heroAge}>{myProfile?.age}</Text>
          </View>
          <View style={styles.heroPillsRow}>
            {myProfile?.position ? (
              <View style={styles.heroPill}>
                <Text style={styles.heroPillText}>{myProfile.position}</Text>
              </View>
            ) : null}
            {myProfile?.lookingFor ? (
              <View style={[styles.heroPill, styles.heroPillAccent]}>
                <Text style={[styles.heroPillText, { color: Colors.accent }]}>{myProfile.lookingFor}</Text>
              </View>
            ) : null}
            {myProfile?.hosting ? (
              <View style={styles.heroPill}>
                <Text style={styles.heroPillText}>{myProfile.hosting}</Text>
              </View>
            ) : null}
            {myProfile?.bodyType ? (
              <View style={styles.heroPill}>
                <Text style={styles.heroPillText}>{myProfile.bodyType}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      {/* ── Action row ───────────────────────────────────────── */}
      <View style={styles.actionRow}>
        <Pressable
          style={[styles.actionBtn, styles.actionBtnPrimary]}
          onPress={() => { Haptics.selectionAsync(); router.push("/setup"); }}
        >
          <Ionicons name="create-outline" size={17} color="#fff" />
          <Text style={styles.actionBtnPrimaryText}>Edit Profile</Text>
        </Pressable>
        <Pressable
          style={[styles.actionBtn, styles.actionBtnSecondary, togglingLive && { opacity: 0.6 }]}
          onPress={handleToggleLive}
          disabled={togglingLive}
        >
          {togglingLive ? (
            <ActivityIndicator size="small" color={isLive ? Colors.online : Colors.textSecondary} />
          ) : (
            <>
              <View style={[styles.toggleDot, { backgroundColor: isLive ? Colors.online : Colors.textMuted }]} />
              <Text style={[styles.actionBtnSecondaryText, isLive && { color: Colors.online }]}>
                {isLive ? "Go Offline" : "Go Live"}
              </Text>
            </>
          )}
        </Pressable>
      </View>

      {/* ── Stats row ────────────────────────────────────────── */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{publicPhotos.length}</Text>
          <Text style={styles.statLabel}>Public</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{lockedPhotos.length}</Text>
          <Text style={styles.statLabel}>Locked</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{myProfile?.age}</Text>
          <Text style={styles.statLabel}>Age</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: isLive ? Colors.online : Colors.textMuted, fontSize: 11 }]}>
            {isLive ? "LIVE" : "OFFLINE"}
          </Text>
          <Text style={styles.statLabel}>Status</Text>
        </View>
      </View>

      {/* ── Bio ──────────────────────────────────────────────── */}
      {myProfile?.bio ? (
        <View style={styles.bioCard}>
          <Text style={styles.bioCardLabel}>About</Text>
          <Text style={styles.bioCardText}>{myProfile.bio}</Text>
        </View>
      ) : (
        <Pressable style={styles.bioEmpty} onPress={() => router.push("/setup")}>
          <Ionicons name="add-circle-outline" size={16} color={Colors.textMuted} />
          <Text style={styles.bioEmptyText}>Add a bio to tell others about yourself</Text>
        </Pressable>
      )}

      {/* ── Photos ───────────────────────────────────────────── */}
      <View style={styles.section}>
        <PhotoGrid />
      </View>

      {/* ── Account ──────────────────────────────────────────── */}
      <View style={styles.dangerSection}>
        <Text style={styles.dangerHeading}>Account</Text>
        <Pressable
          onPress={confirmDeleteProfile}
          disabled={deleting}
          style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.85 }, deleting && { opacity: 0.6 }]}
        >
          {deleting ? <ActivityIndicator size="small" color={Colors.danger} /> : <Ionicons name="trash-outline" size={16} color={Colors.danger} />}
          <Text style={styles.deleteBtnText}>{deleting ? "Deleting..." : "Delete Profile"}</Text>
        </Pressable>
        <Text style={styles.dangerHint}>Permanently removes your profile, photos, messages, and unlock history.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  centered: { alignItems: "center", justifyContent: "center" },

  noProfileTitle: { fontSize: 22, fontWeight: "700", color: Colors.text, fontFamily: "Inter_700Bold", marginTop: 16 },
  noProfileSub: { fontSize: 14, color: Colors.textSecondary, textAlign: "center", fontFamily: "Inter_400Regular", marginTop: 8 },
  setupBtn: { marginTop: 24, backgroundColor: Colors.accent, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  setupBtnText: { fontSize: 15, fontWeight: "600", color: "#fff", fontFamily: "Inter_600SemiBold" },

  // ── Hero
  hero: { width: "100%", position: "relative", justifyContent: "flex-end" },
  heroFallbackLetter: { fontSize: 96, fontWeight: "700", color: "#fff", fontFamily: "Inter_700Bold" },
  heroTopRow: {
    position: "absolute", top: 0, left: 0, right: 0,
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", paddingHorizontal: 16,
  },
  liveChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1,
  },
  liveChipOn: { backgroundColor: "rgba(0,230,118,0.12)", borderColor: "rgba(0,230,118,0.4)" },
  liveChipOff: { backgroundColor: "rgba(0,0,0,0.45)", borderColor: "rgba(255,255,255,0.12)" },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  liveChipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  heroEditBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center", justifyContent: "center",
  },
  heroBottom: { paddingHorizontal: 18, paddingBottom: 20 },
  heroNameRow: { flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 10 },
  heroName: { fontSize: 30, fontWeight: "700", color: "#fff", fontFamily: "Inter_700Bold" },
  heroAge: { fontSize: 22, color: "rgba(255,255,255,0.75)", fontFamily: "Inter_400Regular" },
  heroPillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  heroPill: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.5)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)",
  },
  heroPillAccent: { backgroundColor: "rgba(255,61,107,0.2)", borderColor: "rgba(255,61,107,0.5)" },
  heroPillText: { fontSize: 12, color: "rgba(255,255,255,0.85)", fontFamily: "Inter_500Medium" },

  // ── Action row
  actionRow: {
    flexDirection: "row", gap: 10,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 8,
    paddingVertical: 13, borderRadius: 14,
  },
  actionBtnPrimary: { backgroundColor: Colors.accent },
  actionBtnPrimaryText: { fontSize: 14, color: "#fff", fontFamily: "Inter_600SemiBold" },
  actionBtnSecondary: {
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
  },
  actionBtnSecondaryText: { fontSize: 14, color: Colors.textSecondary, fontFamily: "Inter_600SemiBold" },
  toggleDot: { width: 8, height: 8, borderRadius: 4 },

  // ── Stats row
  statsRow: {
    flexDirection: "row", backgroundColor: Colors.bgCard,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  statItem: { flex: 1, alignItems: "center", paddingVertical: 14, gap: 3 },
  statValue: { fontSize: 17, fontWeight: "700", color: Colors.text, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, color: Colors.textMuted, fontFamily: "Inter_400Regular", textTransform: "uppercase", letterSpacing: 0.4 },
  statDivider: { width: 1, backgroundColor: Colors.border, marginVertical: 10 },

  // ── Bio
  bioCard: {
    marginHorizontal: 16, marginTop: 14, marginBottom: 2,
    backgroundColor: Colors.bgCard, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 18, paddingVertical: 14,
  },
  bioCardLabel: { fontSize: 11, color: Colors.accent, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  bioCardText: { fontSize: 14, color: Colors.text, fontFamily: "Inter_400Regular", lineHeight: 21 },
  bioEmpty: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 16, marginTop: 14, marginBottom: 2,
    backgroundColor: Colors.bgCard, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border, borderStyle: "dashed",
    paddingHorizontal: 18, paddingVertical: 14,
  },
  bioEmptyText: { fontSize: 13, color: Colors.textMuted, fontFamily: "Inter_400Regular" },

  section: { padding: 16 },
  photoSectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  photoSectionTitle: { fontSize: 15, fontWeight: "600", color: Colors.textSecondary, fontFamily: "Inter_600SemiBold", flex: 1 },
  photoSectionCount: { fontSize: 13, color: Colors.textMuted, fontFamily: "Inter_400Regular" },
  reorderBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12,
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
  },
  reorderBtnText: { fontSize: 12, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  lockedHint: { fontSize: 12, color: Colors.textMuted, fontFamily: "Inter_400Regular", marginBottom: 12, marginTop: -4 },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  photoItem: { width: 108, height: 144, borderRadius: 14, overflow: "hidden", position: "relative" },
  photoImage: { width: "100%", height: "100%" },
  lockedOverlay: { zIndex: 2, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.3)" },
  photoRemoveBtn: { position: "absolute", top: 4, right: 4, zIndex: 3, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 10 },
  addPhotoBtn: {
    width: 108, height: 144, borderRadius: 14,
    borderWidth: 1.5, borderColor: Colors.border, borderStyle: "dashed",
    alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: Colors.bgCard,
  },
  addPhotoBtnText: { fontSize: 11, color: Colors.accent, fontFamily: "Inter_500Medium" },
  addPhotoBtnDisabled: { opacity: 0.55, backgroundColor: Colors.bgCard },
  mainBadge: {
    position: "absolute", bottom: 4, left: 4, zIndex: 3,
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: Colors.accent, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8,
  },
  mainBadgeText: { fontSize: 9, fontWeight: "700", color: "#fff", fontFamily: "Inter_700Bold" },
  tipText: { fontSize: 11, color: Colors.textMuted, fontFamily: "Inter_400Regular", marginTop: 14, textAlign: "center" },

  dangerSection: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24, borderTopWidth: 1, borderTopColor: Colors.border, marginTop: 4 },
  dangerHeading: { fontSize: 12, fontWeight: "700", color: Colors.textMuted, letterSpacing: 0.8, textTransform: "uppercase", fontFamily: "Inter_700Bold", marginTop: 12, marginBottom: 10 },
  deleteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.danger, backgroundColor: "rgba(255, 68, 68, 0.08)" },
  deleteBtnText: { fontSize: 14, fontWeight: "600", color: Colors.danger, fontFamily: "Inter_600SemiBold" },
  dangerHint: { fontSize: 12, color: Colors.textMuted, fontFamily: "Inter_400Regular", marginTop: 8, textAlign: "center", lineHeight: 17 },
});
