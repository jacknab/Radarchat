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
import { useApp, NearbyUser } from "@/contexts/AppContext";
import { resolvePhotoUri } from "@/lib/api";

const AUTO_DISMISS_MS = 7000;
const FALLBACK_COLORS = ["#FF7A00", "#6C5CE7", "#00B4D8", "#06D6A0", "#FFB703", "#FB8500"];

function fallbackColorFor(name: string) {
  if (!name) return Colors.textMuted;
  return FALLBACK_COLORS[name.charCodeAt(0) % FALLBACK_COLORS.length];
}

function formatDistance(miles: number): string {
  const feet = Math.round(miles * 5280);
  if (feet < 5280) return `${feet.toLocaleString()} ft`;
  return `${miles.toFixed(1)} mi`;
}

export function RadarEntrantToast() {
  const { newRadarEntrants, dismissRadarEntrant } = useApp();
  const insets = useSafeAreaInsets();

  const [active, setActive] = useState<NearbyUser | null>(null);
  const translateY = useRef(new Animated.Value(-200)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pick next entrant from the queue
  useEffect(() => {
    if (active) return;
    if (newRadarEntrants.length === 0) return;
    setActive(newRadarEntrants[0]);
  }, [newRadarEntrants, active]);

  // If the currently-shown user was removed from the queue (they left the area),
  // silently close the toast — no animation, no dismissRadarEntrant call needed
  // since AppContext already removed them from the list.
  useEffect(() => {
    if (!active) return;
    const stillQueued = newRadarEntrants.some((u) => u.id === active.id);
    if (stillQueued) return;
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    pulseAnim.stopAnimation();
    // Reset all animation values and clear the active state instantly
    translateY.setValue(-200);
    opacity.setValue(0);
    scale.setValue(0.92);
    pulseAnim.setValue(1);
    setActive(null);
  }, [newRadarEntrants, active]);

  // Animate in and start pulse when active
  useEffect(() => {
    if (!active) return;

    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 18,
        stiffness: 200,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        damping: 16,
        stiffness: 220,
      }),
    ]).start();

    // Pulsing ring animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.18, duration: 700, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
      ])
    ).start();

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
    pulseAnim.stopAnimation();
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -200,
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
      translateY.setValue(-200);
      scale.setValue(0.92);
      pulseAnim.setValue(1);
      dismissRadarEntrant();
      after?.();
    });
  }

  if (!active) return null;

  const displayName = active.name || "Someone nearby";
  const publicPhoto = active.photos.find((p) => !p.isLocked);
  const topOffset = insets.top + (Platform.OS === "web" ? 12 : 8);

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        { top: topOffset, transform: [{ translateY }, { scale }], opacity },
      ]}
    >
      <Pressable
        onPress={() => {
          if (Platform.OS !== "web") Haptics.selectionAsync();
          dismiss(() => router.push({ pathname: "/user/[id]", params: { id: active.id } }));
        }}
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.93 }]}
      >
        {/* Green top accent bar */}
        <View style={styles.accentBar} />

        <View style={styles.row}>
          {/* Avatar with pulsing ring */}
          <View style={styles.avatarWrap}>
            <Animated.View
              style={[
                styles.pulseRing,
                { transform: [{ scale: pulseAnim }] },
              ]}
            />
            {publicPhoto ? (
              <Image
                source={{ uri: resolvePhotoUri(publicPhoto.uri) }}
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
                <Text style={styles.avatarLetter}>{displayName[0] ?? "?"}</Text>
              </View>
            )}
            {/* Online dot */}
            <View style={styles.onlineDot} />
            {/* Radar badge */}
            <View style={styles.radarBadge}>
              <Ionicons name="locate" size={9} color="#fff" />
            </View>
          </View>

          {/* Info */}
          <View style={styles.body}>
            <View style={styles.titleRow}>
              <Text style={styles.title} numberOfLines={1}>
                {displayName}
                {active.age ? `, ${active.age}` : ""}
              </Text>
            </View>
            <Text style={styles.sub} numberOfLines={1}>
              Just entered your radar · {formatDistance(active.distanceMiles)}
            </Text>
            {active.position ? (
              <View style={styles.positionBadge}>
                <Text style={styles.positionText}>{active.position}</Text>
              </View>
            ) : null}
          </View>

          {/* Close */}
          <Pressable
            hitSlop={8}
            onPress={(e) => {
              e.stopPropagation?.();
              dismiss();
            }}
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
    zIndex: 1001,
  },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.online,
    overflow: "hidden",
    shadowColor: Colors.online,
    shadowOpacity: 0.28,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 14,
  },
  accentBar: {
    height: 3,
    backgroundColor: Colors.online,
    opacity: 0.85,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  avatarWrap: {
    position: "relative",
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseRing: {
    position: "absolute",
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 2,
    borderColor: Colors.online,
    opacity: 0.4,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    borderColor: Colors.online,
  },
  avatarLetter: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    fontFamily: "Inter_700Bold",
  },
  onlineDot: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: Colors.online,
    borderWidth: 2,
    borderColor: Colors.bgCard,
  },
  radarBadge: {
    position: "absolute",
    bottom: -2,
    left: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.online,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.bgCard,
  },
  body: {
    flex: 1,
    gap: 3,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
    flexShrink: 1,
  },
  sub: {
    fontSize: 12,
    color: Colors.online,
    fontFamily: "Inter_500Medium",
  },
  positionBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: "rgba(0,230,118,0.12)",
    borderWidth: 1,
    borderColor: "rgba(0,230,118,0.3)",
  },
  positionText: {
    fontSize: 10,
    color: Colors.online,
    fontFamily: "Inter_500Medium",
  },
  closeBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
});
