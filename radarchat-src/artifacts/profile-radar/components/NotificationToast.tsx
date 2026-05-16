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
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { useApp, AppNotification } from "@/contexts/AppContext";
import { resolvePhotoUri } from "@/lib/api";

const AUTO_DISMISS_MS = 6000;
const FALLBACK_COLORS = ["#FF7A00", "#6C5CE7", "#00B4D8", "#06D6A0", "#FFB703", "#FB8500"];

function fallbackColorFor(name: string) {
  if (!name) return Colors.textMuted;
  return FALLBACK_COLORS[name.charCodeAt(0) % FALLBACK_COLORS.length];
}

export function NotificationToast() {
  const { notifications } = useApp();
  const insets = useSafeAreaInsets();

  const seenRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const [active, setActive] = useState<AppNotification | null>(null);
  const translateY = useRef(new Animated.Value(-160)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (initializedRef.current) return;
    notifications.forEach((n) => seenRef.current.add(n.id));
    initializedRef.current = true;
  }, [notifications]);

  useEffect(() => {
    if (!initializedRef.current) return;
    if (active) return;
    const next = notifications.find((n) => !seenRef.current.has(n.id));
    if (next) {
      seenRef.current.add(next.id);
      setActive(next);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [notifications, active]);

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
    dismissTimerRef.current = setTimeout(() => dismiss(), AUTO_DISMISS_MS);
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
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

  const displayName = active.senderName || "Someone nearby";
  const isView = active.type === "profile_view";
  const topOffset = insets.top + (Platform.OS === "web" ? 12 : 8);
  const badgeColor = isView ? Colors.accent : "#FF6B35";
  const badgeIcon = isView ? "eye" : "flame";
  const subText = isView ? "viewed your profile" : "added you to Hot Stuff 🔥";

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrap, { top: topOffset, transform: [{ translateY }], opacity }]}
    >
      <Pressable
        onPress={() => {
          Haptics.selectionAsync();
          dismiss(() => router.push(`/user/${active.senderId}` as never));
        }}
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}
      >
        <View style={styles.row}>
          <View style={styles.avatarWrap}>
            {active.senderPhotoUri ? (
              <Image
                source={{ uri: resolvePhotoUri(active.senderPhotoUri) }}
                style={styles.avatar}
                resizeMode="cover"
              />
            ) : (
              <View
                style={[
                  styles.avatar,
                  { backgroundColor: fallbackColorFor(displayName), alignItems: "center", justifyContent: "center" },
                ]}
              >
                <Text style={styles.avatarLetter}>{displayName[0] ?? "?"}</Text>
              </View>
            )}
            <View style={[styles.badge, { backgroundColor: badgeColor }]}>
              <Ionicons name={badgeIcon as never} size={10} color="#fff" />
            </View>
          </View>

          <View style={styles.body}>
            <Text style={styles.title} numberOfLines={1}>{displayName}</Text>
            <Text style={styles.sub} numberOfLines={1}>{subText}</Text>
          </View>

          <Pressable
            hitSlop={8}
            onPress={(e) => { e.stopPropagation?.(); dismiss(); }}
            style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="close" size={16} color={Colors.textSecondary} />
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
    zIndex: 999,
  },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    paddingHorizontal: 14,
    paddingVertical: 12,
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
  badge: {
    position: "absolute",
    bottom: -2,
    left: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
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
});
