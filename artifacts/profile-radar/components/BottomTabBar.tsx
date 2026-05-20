import React from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { useApp } from "@/contexts/AppContext";

const TABS: {
  label: string;
  route: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
}[] = [
  { label: "Radar",    route: "/(tabs)/",        icon: "map"         },
  { label: "Nearby",   route: "/(tabs)/browse",   icon: "people"      },
  { label: "Messages", route: "/(tabs)/messages", icon: "chatbubbles" },
  { label: "Profile",  route: "/(tabs)/profile",  icon: "person"      },
];

export function BottomTabBar() {
  const insets = useSafeAreaInsets();
  const { conversations, incomingUnlockRequests, unreadNotificationCount } = useApp();

  const totalUnread = conversations.reduce((a, c) => a + c.unreadCount, 0);
  const messagesBadge = totalUnread + incomingUnlockRequests.length;

  const badges: Record<string, number> = {
    "/(tabs)/messages": messagesBadge,
    "/(tabs)/profile":  unreadNotificationCount,
  };

  const isIOS = Platform.OS === "ios";

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]} pointerEvents="box-none">
      {isIOS ? (
        <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.bgCard }]} />
      )}
      <View style={styles.row} pointerEvents="box-none">
        {TABS.map((tab) => {
          const badge = badges[tab.route] ?? 0;
          return (
            <Pressable
              key={tab.route}
              style={styles.tab}
              onPress={() => {
                if (Platform.OS !== "web") Haptics.selectionAsync();
                router.navigate(tab.route as any);
              }}
            >
              <View style={styles.iconWrap}>
                <Ionicons name={tab.icon} size={24} color="#4E4E72" />
                {badge > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {badge > 99 ? "99+" : String(badge)}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.label}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    height: 49,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  iconWrap: {
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: -5,
    right: -5,
    backgroundColor: Colors.accent,
    borderRadius: 10,
    minWidth: 19,
    height: 19,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.bg,
    paddingHorizontal: 4,
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 15,
  },
  label: {
    fontSize: 10,
    color: "#4E4E72",
    fontFamily: "Inter_500Medium",
  },
});
