import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, usePathname } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { useApp, IncomingUnlockRequest } from "@/contexts/AppContext";
import { resolvePhotoUri } from "@/lib/api";

const AUTO_DISMISS_MS = 8000;
const FALLBACK_COLORS = [
  "#FF7A00",
  "#6C5CE7",
  "#00B4D8",
  "#06D6A0",
  "#FFB703",
  "#FB8500",
];

function fallbackColorFor(name: string) {
  if (!name) return Colors.textMuted;
  return FALLBACK_COLORS[name.charCodeAt(0) % FALLBACK_COLORS.length];
}

export function UnlockRequestToast() {
  const { incomingUnlockRequests, approveUnlockRequest, denyUnlockRequest } =
    useApp();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();

  // Hide on the Messages tab since the inbox is already visible there.
  const isOnMessages = pathname?.startsWith("/messages");

  // Track which request IDs we've already shown a toast for so we don't re-show
  // the same one while it's still in the incoming list.
  const seenRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  const [active, setActive] = useState<IncomingUnlockRequest | null>(null);
  const translateY = useRef(new Animated.Value(-160)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // On first run, treat all existing requests as already-seen so we only toast
  // for genuinely new arrivals (not the backlog).
  useEffect(() => {
    if (initializedRef.current) return;
    incomingUnlockRequests.forEach((r) => seenRef.current.add(r.requesterId));
    initializedRef.current = true;
  }, [incomingUnlockRequests]);

  // Detect a new request and show the toast for it.
  useEffect(() => {
    if (!initializedRef.current) return;
    if (isOnMessages) return;
    if (active) return;
    const next = incomingUnlockRequests.find(
      (r) => !seenRef.current.has(r.requesterId),
    );
    if (next) {
      seenRef.current.add(next.requesterId);
      setActive(next);
    }
  }, [incomingUnlockRequests, active, isOnMessages]);

  // Drop seen IDs that are no longer in the incoming list (so they can re-toast
  // if they ever come back).
  useEffect(() => {
    const currentIds = new Set(
      incomingUnlockRequests.map((r) => r.requesterId),
    );
    seenRef.current.forEach((id) => {
      if (!currentIds.has(id)) seenRef.current.delete(id);
    });
  }, [incomingUnlockRequests]);

  // Animate in/out and schedule auto-dismiss.
  useEffect(() => {
    if (!active) return;
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
    dismissTimerRef.current = setTimeout(() => {
      dismiss();
    }, AUTO_DISMISS_MS);
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  function dismiss(after?: () => void) {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -160,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setActive(null);
      after?.();
    });
  }

  if (!active) return null;

  const displayName = active.name || "Someone nearby";
  const topOffset =
    insets.top + (Platform.OS === "web" ? 12 : 8);

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        { top: topOffset, transform: [{ translateY }], opacity },
      ]}
    >
      <Pressable
        onPress={() => {
          Haptics.selectionAsync();
          dismiss(() => router.push("/(tabs)/messages"));
        }}
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}
      >
        <View style={styles.row}>
          <View style={styles.avatarWrap}>
            {active.photoUri ? (
              <Image
                source={{ uri: resolvePhotoUri(active.photoUri) }}
                style={styles.avatar}
                resizeMode="cover"
              />
            ) : (
              <View
                style={[
                  styles.avatar,
                  {
                    backgroundColor: fallbackColorFor(displayName),
                    alignItems: "center",
                    justifyContent: "center",
                  },
                ]}
              >
                <Text style={styles.avatarLetter}>
                  {displayName[0] ?? "?"}
                </Text>
              </View>
            )}
            <View style={styles.lockBadge}>
              <Ionicons name="lock-open" size={10} color="#fff" />
            </View>
          </View>

          <View style={styles.body}>
            <Text style={styles.title} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              wants to see your locked photos
            </Text>
          </View>

          <Pressable
            hitSlop={8}
            onPress={(e) => {
              e.stopPropagation?.();
              dismiss();
            }}
            style={({ pressed }) => [
              styles.closeBtn,
              pressed && { opacity: 0.6 },
            ]}
          >
            <Ionicons name="close" size={16} color={Colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              Haptics.selectionAsync();
              const id = active.requesterId;
              dismiss(() => denyUnlockRequest(id));
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
            onPress={(e) => {
              e.stopPropagation?.();
              Haptics.selectionAsync();
              const id = active.requesterId;
              dismiss(() => approveUnlockRequest(id));
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
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 1000,
  },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatarWrap: { position: "relative" },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  avatarLetter: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    fontFamily: "Inter_700Bold",
  },
  lockBadge: {
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
    borderColor: Colors.bgCard,
  },
  body: { flex: 1, gap: 2 },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
  },
  sub: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
  },
  closeBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  actions: { flexDirection: "row", gap: 8 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 10,
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
});
