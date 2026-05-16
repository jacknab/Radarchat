import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  Alert,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as Crypto from "expo-crypto";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { MAX_PUBLIC_PHOTOS, MAX_LOCKED_PHOTOS, MAX_TOTAL_PHOTOS } from "@/constants/photos";
import { useApp, type Photo } from "@/contexts/AppContext";
import { uploadPhoto } from "@/lib/api";

const POSITIONS = ["Top", "Bottom", "Versatile", "Vers Top", "Vers Bottom", "Side"];
const BODY_TYPES = ["Athletic", "Slim", "Average", "Muscular", "Stocky", "Heavyset"];
const ENDOWMENTS = ["Cut", "Uncut"];
const LOOKING_FORS = ["Right Now", "Tonight", "This Week", "Regular", "Discreet"];
const HOSTING_OPTIONS = ["Can Host", "Can Travel", "Host & Travel", "No Host"];
const AGE_ITEMS = Array.from({ length: 53 }, (_, i) => String(i + 18));

const WHOLE_ITEMS = ["0","1","2","3","4","5","6","7","8","9","10","11","12"];
const FRAC_ITEMS = ['.0"', '.5"'];
const PICKER_ITEM_H = 46;
const PICKER_VISIBLE = 3;

function WheelPicker({
  items,
  selectedIndex,
  onIndexChange,
  width,
}: {
  items: string[];
  selectedIndex: number;
  onIndexChange: (i: number) => void;
  width: number;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const isScrolling = useRef(false);

  useEffect(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: selectedIndex * PICKER_ITEM_H, animated: false });
    });
  }, []);

  function handleScrollEnd(e: any) {
    const y = e.nativeEvent.contentOffset.y;
    const raw = Math.round(y / PICKER_ITEM_H);
    const idx = Math.max(0, Math.min(raw, items.length - 1));
    isScrolling.current = false;
    if (idx !== selectedIndex) {
      Haptics.selectionAsync();
      onIndexChange(idx);
    }
  }

  const padV = PICKER_ITEM_H * Math.floor(PICKER_VISIBLE / 2);

  return (
    <View style={{ width, height: PICKER_ITEM_H * PICKER_VISIBLE, borderRadius: 14, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.04)" }}>
      <View
        pointerEvents="none"
        style={{
          position: "absolute", top: padV, height: PICKER_ITEM_H,
          left: 0, right: 0, zIndex: 2,
          borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.accent,
          backgroundColor: "rgba(255,122,0,0.1)",
        }}
      />
      <ScrollView
        ref={scrollRef}
        snapToInterval={PICKER_ITEM_H}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: padV }}
        onScrollBeginDrag={() => { isScrolling.current = true; }}
        onMomentumScrollEnd={handleScrollEnd}
        onScrollEndDrag={handleScrollEnd}
        scrollEventThrottle={16}
      >
        {items.map((item, i) => (
          <View key={item} style={{ height: PICKER_ITEM_H, alignItems: "center", justifyContent: "center" }}>
            <Text style={{
              fontSize: 20, fontWeight: "600", fontFamily: "Inter_600SemiBold",
              color: i === selectedIndex ? Colors.text : Colors.textMuted,
              opacity: i === selectedIndex ? 1 : 0.45,
            }}>
              {item}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

export default function SetupScreen() {
  const insets = useSafeAreaInsets();
  const { saveProfile, myProfile, userToken } = useApp();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(myProfile?.name ?? "");
  const [ageIdx, setAgeIdx] = useState(() => {
    const existing = myProfile?.age ? parseInt(myProfile.age) : 18;
    const clamped = Math.max(18, Math.min(70, existing));
    return clamped - 18;
  });
  const [position, setPosition] = useState(myProfile?.position ?? "");
  const [bodyType, setBodyType] = useState(myProfile?.bodyType ?? "");
  const [endowment, setEndowment] = useState(myProfile?.endowment ?? "");
  const [lookingFor, setLookingFor] = useState(myProfile?.lookingFor ?? "");
  const [hosting, setHosting] = useState(myProfile?.hosting ?? "");
  const [intoTags, setIntoTags] = useState<string[]>(
    myProfile?.into ? myProfile.into.split(",").map((t) => t.trim()).filter(Boolean) : []
  );
  const [cockSizeWhole, setCockSizeWhole] = useState(() => {
    const existing = myProfile?.cockSize ?? "0.0";
    const whole = existing.split(".")[0] ?? "0";
    return Math.max(0, Math.min(12, parseInt(whole) || 0));
  });
  const [cockSizeFrac, setCockSizeFrac] = useState(() => {
    const existing = myProfile?.cockSize ?? "0.0";
    const frac = existing.split(".")[1]?.replace('"', "") ?? "0";
    return frac === "5" ? 1 : 0;
  });
  const [photos, setPhotos] = useState<Photo[]>(myProfile?.photos ?? []);
  const [pickingPhoto, setPickingPhoto] = useState(false);

  const steps = [
    { title: "What's your name?", subtitle: "This is how others will see you" },
    { title: "How old are you?", subtitle: "Your age will be shown on your profile" },
    { title: "Your stats", subtitle: "Position, body type, and size" },
    { title: "What are you packing?", subtitle: "Cut or uncut — guys like to know" },
    { title: "When & where?", subtitle: "Availability and hosting situation" },
    { title: "What are you into?", subtitle: "Be direct — tell guys what you want and what you've got" },
    { title: "Add your photos", subtitle: `Optional — you can upload photos later. Up to ${MAX_PUBLIC_PHOTOS} public + ${MAX_LOCKED_PHOTOS} locked. Tap a photo to lock it as private.` },
  ];

  async function handleNext() {
    if (step < steps.length - 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setStep((s) => s + 1);
    } else {
      await handleFinish();
    }
  }

  async function pickPhoto() {
    const publicCount = photos.filter((p) => !p.isLocked).length;
    if (photos.length >= MAX_TOTAL_PHOTOS) {
      Alert.alert("Limit reached", `You can add up to ${MAX_TOTAL_PHOTOS} photos in total.`);
      return;
    }
    if (publicCount >= MAX_PUBLIC_PHOTOS) {
      Alert.alert(
        "Public gallery full",
        `You already have ${MAX_PUBLIC_PHOTOS} public photos. Tap one to lock it before adding more.`,
      );
      return;
    }
    try {
      setPickingPhoto(true);
      if (Platform.OS !== "web") {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert(
            "Photo access needed",
            "Please allow photo library access to add photos to your profile."
          );
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.85,
        base64: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const uri =
        asset.base64 && asset.base64.length > 0
          ? `data:${asset.mimeType ?? "image/jpeg"};base64,${asset.base64}`
          : asset.uri;
      const newPhoto: Photo = {
        id: Crypto.randomUUID(),
        uri,
        // First photo is always public; subsequent default to public, user can toggle.
        isLocked: false,
      };
      setPhotos((prev) => [...prev, newPhoto]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.warn("pickPhoto error", e);
      Alert.alert("Error", "Could not load that photo. Please try another.");
    } finally {
      setPickingPhoto(false);
    }
  }

  function toggleLock(id: string) {
    Haptics.selectionAsync();
    setPhotos((prev) => {
      // The first photo (index 0) is always public — it's the headshot shown on the radar.
      const idx = prev.findIndex((p) => p.id === id);
      if (idx === 0) {
        Alert.alert("Public photo", "Your first photo is shown on the radar and can't be locked.");
        return prev;
      }
      const target = prev[idx];
      if (!target) return prev;
      const lockedCount = prev.filter((p) => p.isLocked).length;
      const publicCount = prev.length - lockedCount;
      if (!target.isLocked && lockedCount >= MAX_LOCKED_PHOTOS) {
        Alert.alert(
          "Locked gallery full",
          `You can have up to ${MAX_LOCKED_PHOTOS} locked photos.`,
        );
        return prev;
      }
      if (target.isLocked && publicCount >= MAX_PUBLIC_PHOTOS) {
        Alert.alert(
          "Public gallery full",
          `You can have up to ${MAX_PUBLIC_PHOTOS} public photos.`,
        );
        return prev;
      }
      return prev.map((p) => (p.id === id ? { ...p, isLocked: !p.isLocked } : p));
    });
  }

  function removePhoto(id: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  }

  async function handleFinish() {
    setSaving(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      let lat = myProfile?.latitude ?? 37.7749;
      let lon = myProfile?.longitude ?? -122.4194;
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.granted) {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          lat = loc.coords.latitude;
          lon = loc.coords.longitude;
        }
      } catch (_locErr) {}

      // Upload any data-URI photos to the server before saving the profile.
      // Sending raw base64 in the profile body can exceed the JSON size limit.
      const token = userToken ?? "";

      const uploadedPhotos: Photo[] = await Promise.all(
        photos.map(async (p) => {
          if (!p.uri.startsWith("data:") && !p.uri.startsWith("file:")) return p;
          try {
            const { url, thumbnailUrl } = await uploadPhoto(p.uri, token);
            return { ...p, uri: url, thumbnailUri: thumbnailUrl };
          } catch {
            return p;
          }
        })
      );

      const cockSizeValue = `${cockSizeWhole}.${cockSizeFrac === 1 ? "5" : "0"}`;

      await saveProfile({
        name: name.trim(),
        age: AGE_ITEMS[ageIdx] ?? "18",
        position,
        bodyType,
        endowment,
        lookingFor,
        hosting,
        cockSize: cockSizeValue,
        into: intoTags.join(","),
        photos: uploadedPhotos,
        latitude: lat,
        longitude: lon,
        isOnline: true,
      });
      router.replace("/(tabs)");
    } catch (e) {
      Alert.alert("Error", "Failed to save profile. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const canProceed = () => {
    if (step === 0) return name.trim().length >= 2;
    if (step === 1) return true;
    if (step === 2) return position.length > 0 && bodyType.length > 0;
    if (step === 3) return endowment.length > 0;
    if (step === 4) return lookingFor.length > 0 && hosting.length > 0;
    if (step === 5) return true;
    if (step === 6) return true;
    return false;
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.progressRow}>
          {steps.map((_, i) => (
            <View
              key={i}
              style={[styles.progressDot, i <= step && styles.progressDotActive, i < step && styles.progressDotDone]}
            />
          ))}
        </View>

        <Text style={styles.title}>{steps[step].title}</Text>
        <Text style={styles.subtitle}>{steps[step].subtitle}</Text>

        {step === 0 && (
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={(text) => setName(text.replace(/[^a-zA-Z]/g, "").slice(0, 10))}
            placeholder="Your name"
            placeholderTextColor={Colors.textMuted}
            autoFocus
            maxLength={10}
            autoCorrect={false}
          />
        )}

        {step === 1 && (
          <View style={styles.agePickerWrap}>
            <WheelPicker
              items={AGE_ITEMS}
              selectedIndex={ageIdx}
              onIndexChange={setAgeIdx}
              width={120}
            />
            <Text style={styles.ageUnit}>years old</Text>
          </View>
        )}

        {step === 2 && (
          <View>
            <Text style={styles.chipLabel}>Position</Text>
            <View style={[styles.chipRow, { marginBottom: 28 }]}>
              {POSITIONS.map((pos) => (
                <Pressable
                  key={pos}
                  style={[styles.chip, position === pos && styles.chipActive]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setPosition(pos);
                  }}
                >
                  <Text style={[styles.chipText, position === pos && styles.chipTextActive]}>{pos}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.chipLabel}>Body Type</Text>
            <View style={[styles.chipRow, { marginBottom: 28 }]}>
              {BODY_TYPES.map((bt) => (
                <Pressable
                  key={bt}
                  style={[styles.chip, bodyType === bt && styles.chipActive]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setBodyType(bt);
                  }}
                >
                  <Text style={[styles.chipText, bodyType === bt && styles.chipTextActive]}>{bt}</Text>
                </Pressable>
              ))}
            </View>

          </View>
        )}

        {step === 3 && (
          <View>
            <View style={[styles.chipRow, { marginBottom: 28 }]}>
              {ENDOWMENTS.map((e) => (
                <Pressable
                  key={e}
                  style={[styles.chip, endowment === e && styles.chipActive]}
                  onPress={() => { Haptics.selectionAsync(); setEndowment(e); }}
                >
                  <Text style={[styles.chipText, endowment === e && styles.chipTextActive]}>{e}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.cockSizeRow}>
              <View>
                <Text style={styles.chipLabel}>
                  Size{" "}
                  <Text style={styles.optionalLabel}>(optional)</Text>
                </Text>
                <View style={styles.pickerRow}>
                  <WheelPicker
                    items={WHOLE_ITEMS}
                    selectedIndex={cockSizeWhole}
                    onIndexChange={setCockSizeWhole}
                    width={72}
                  />
                  <View style={styles.pickerSeparator}>
                    <Text style={styles.pickerSepText}>.</Text>
                  </View>
                  <WheelPicker
                    items={FRAC_ITEMS}
                    selectedIndex={cockSizeFrac}
                    onIndexChange={setCockSizeFrac}
                    width={72}
                  />
                </View>
              </View>
              <View style={styles.cockSizeDisplay}>
                <Text style={styles.cockSizeDisplayValue}>
                  {cockSizeWhole}.{cockSizeFrac === 1 ? "5" : "0"}"
                </Text>
                <Text style={styles.cockSizeDisplayLabel}>inches</Text>
              </View>
            </View>
          </View>
        )}

        {step === 4 && (
          <View>
            <Text style={styles.chipLabel}>Looking for</Text>
            <View style={[styles.chipRow, { marginBottom: 28 }]}>
              {LOOKING_FORS.map((lf) => (
                <Pressable
                  key={lf}
                  style={[styles.chip, lookingFor === lf && styles.chipActive]}
                  onPress={() => { Haptics.selectionAsync(); setLookingFor(lf); }}
                >
                  <Text style={[styles.chipText, lookingFor === lf && styles.chipTextActive]}>{lf}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.chipLabel}>Hosting</Text>
            <View style={styles.chipRow}>
              {HOSTING_OPTIONS.map((h) => (
                <Pressable
                  key={h}
                  style={[styles.chip, hosting === h && styles.chipActive]}
                  onPress={() => { Haptics.selectionAsync(); setHosting(h); }}
                >
                  <Text style={[styles.chipText, hosting === h && styles.chipTextActive]}>{h}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {step === 5 && (
          <View>
            <Text style={[styles.chipLabel, { marginBottom: 4 }]}>Pick up to 8</Text>
            <View style={styles.chipRow}>
              {(["Oral","Anal","Rimming","Kissing","JO / Mutual","Raw","Safe Sex","Kink","Fisting","Toys","Groups","Outdoors","Cruising","Discreet","NSA","Regular"] as const).map((tag) => {
                const selected = intoTags.includes(tag);
                return (
                  <Pressable
                    key={tag}
                    style={[styles.chip, selected && styles.chipActive]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setIntoTags((prev) =>
                        selected ? prev.filter((t) => t !== tag) : prev.length < 8 ? [...prev, tag] : prev
                      );
                    }}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextActive]}>{tag}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {step === 6 && (
          <View>
            <View style={styles.photoGrid}>
              {photos.map((p, idx) => (
                <View key={p.id} style={styles.photoSlot}>
                  <Image source={{ uri: p.uri }} style={styles.photoImage} />
                  {idx === 0 && (
                    <View style={styles.mainBadge}>
                      <Text style={styles.mainBadgeText}>Main</Text>
                    </View>
                  )}
                  {idx > 0 && (
                    <Pressable
                      style={[styles.lockBadge, p.isLocked && styles.lockBadgeLocked]}
                      onPress={() => toggleLock(p.id)}
                      hitSlop={8}
                    >
                      <Ionicons
                        name={p.isLocked ? "lock-closed" : "lock-open"}
                        size={14}
                        color="#fff"
                      />
                      <Text style={styles.lockBadgeText}>{p.isLocked ? "Locked" : "Public"}</Text>
                    </Pressable>
                  )}
                  <Pressable
                    style={styles.removeBadge}
                    onPress={() => removePhoto(p.id)}
                    hitSlop={8}
                  >
                    <Ionicons name="close" size={16} color="#fff" />
                  </Pressable>
                </View>
              ))}

              {photos.length < MAX_TOTAL_PHOTOS && (
                <Pressable
                  style={[styles.photoSlot, styles.photoSlotAdd]}
                  onPress={pickPhoto}
                  disabled={pickingPhoto}
                >
                  {pickingPhoto ? (
                    <ActivityIndicator color={Colors.accent} />
                  ) : (
                    <>
                      <Ionicons name="add" size={32} color={Colors.accent} />
                      <Text style={styles.photoSlotAddText}>
                        {photos.length === 0 ? "Add photo" : "Add more"}
                      </Text>
                    </>
                  )}
                </Pressable>
              )}
            </View>

            <View style={styles.photoHint}>
              <Ionicons name="information-circle" size={16} color={Colors.textSecondary} />
              <Text style={styles.photoHintText}>
                Locked photos stay hidden until you grant someone access.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 16) }]}>
        {step > 0 && (
          <Pressable style={styles.backBtn} onPress={() => setStep((s) => s - 1)}>
            <Ionicons name="arrow-back" size={20} color={Colors.textSecondary} />
          </Pressable>
        )}
        <View style={styles.nextBtnGroup}>
          <Pressable
            style={[styles.nextBtn, !canProceed() && styles.nextBtnDisabled]}
            onPress={handleNext}
            disabled={!canProceed() || saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.nextBtnText}>{step < steps.length - 1 ? "Continue" : "Get Started"}</Text>
            )}
          </Pressable>
          {step === 6 && (
            <Pressable
              style={styles.skipBtn}
              onPress={() => { Haptics.selectionAsync(); handleNext(); }}
              disabled={saving}
            >
              <Text style={styles.skipBtnText}>Skip for now</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 24, paddingBottom: 120 },
  progressRow: { flexDirection: "row", gap: 8, marginBottom: 48 },
  progressDot: {
    flex: 1, height: 4, borderRadius: 2,
    backgroundColor: Colors.border,
  },
  progressDotActive: { backgroundColor: Colors.accent },
  progressDotDone: { backgroundColor: Colors.accent, opacity: 0.5 },
  title: {
    fontSize: 28, fontWeight: "700", color: Colors.text,
    fontFamily: "Inter_700Bold", marginBottom: 8,
  },
  subtitle: {
    fontSize: 15, color: Colors.textSecondary,
    fontFamily: "Inter_400Regular", marginBottom: 32,
  },
  input: {
    backgroundColor: Colors.bgCard, borderWidth: 1,
    borderColor: Colors.border, borderRadius: 14,
    paddingHorizontal: 18, paddingVertical: 16,
    fontSize: 17, color: Colors.text, fontFamily: "Inter_400Regular",
  },
  intoInput: { minHeight: 140, textAlignVertical: "top", paddingTop: 16 },
  agePickerWrap: { alignItems: "center", gap: 16, paddingTop: 8 },
  ageUnit: { fontSize: 15, color: Colors.textSecondary, fontFamily: "Inter_400Regular" },
  chipLabel: { fontSize: 13, color: Colors.textSecondary, fontFamily: "Inter_500Medium", marginBottom: 12 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chip: {
    paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: 24, borderWidth: 1,
    borderColor: Colors.border, backgroundColor: Colors.bgCard,
  },
  chipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  chipText: { fontSize: 14, color: Colors.textSecondary, fontFamily: "Inter_500Medium" },
  chipTextActive: { color: "#fff" },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 20,
  },
  photoSlot: {
    width: "31%",
    aspectRatio: 3 / 4,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    position: "relative",
  },
  photoSlotAdd: {
    alignItems: "center",
    justifyContent: "center",
    borderStyle: "dashed",
    borderColor: Colors.accent,
    gap: 4,
  },
  photoSlotAddText: {
    fontSize: 11,
    color: Colors.accent,
    fontFamily: "Inter_500Medium",
  },
  photoImage: {
    width: "100%",
    height: "100%",
  },
  mainBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: Colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  mainBadgeText: {
    fontSize: 10,
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
  },
  lockBadge: {
    position: "absolute",
    bottom: 6,
    left: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
  },
  lockBadgeLocked: {
    backgroundColor: Colors.locked,
  },
  lockBadgeText: {
    fontSize: 10,
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
  },
  removeBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
  },
  photoHintText: {
    flex: 1,
    fontSize: 12,
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
  },
  cockSizeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  pickerSeparator: {
    width: 16,
    alignItems: "center",
  },
  pickerSepText: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.textMuted,
    fontFamily: "Inter_700Bold",
  },
  optionalLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
  },
  cockSizeDisplay: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  cockSizeDisplayValue: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
  },
  cockSizeDisplayLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  footer: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    paddingHorizontal: 28, paddingTop: 16, flexDirection: "row",
    alignItems: "center", gap: 12, backgroundColor: Colors.bg,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  backBtn: {
    width: 48, height: 52, borderRadius: 14, borderWidth: 1,
    borderColor: Colors.border, alignItems: "center", justifyContent: "center",
    backgroundColor: Colors.bgCard,
  },
  nextBtnGroup: { flex: 1, gap: 10 },
  nextBtn: {
    height: 52, borderRadius: 14,
    backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center",
  },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText: { fontSize: 16, fontWeight: "600", color: "#fff", fontFamily: "Inter_600SemiBold" },
  skipBtn: { alignItems: "center", paddingVertical: 6 },
  skipBtnText: { fontSize: 14, color: Colors.textMuted, fontFamily: "Inter_400Regular" },
});
