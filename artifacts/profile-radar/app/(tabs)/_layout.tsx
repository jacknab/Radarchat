import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { NativeTabs, Icon, Label, Badge } from "expo-router/unstable-native-tabs";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { Colors } from "@/constants/colors";
import { useApp } from "@/contexts/AppContext";
import { UnlockRequestToast } from "@/components/UnlockRequestToast";
import { NotificationToast } from "@/components/NotificationToast";
import { RadarEntrantToast } from "@/components/RadarEntrantToast";

function IconWithDotBadge({
  name,
  color,
  size,
  count,
}: {
  name: React.ComponentProps<typeof Ionicons>["name"];
  color: string;
  size: number;
  count: number;
}) {
  return (
    <View style={{ width: size + (count > 0 ? 10 : 0), alignItems: "flex-start", justifyContent: "center" }}>
      <Ionicons name={name} size={size} color={color} />
      {count > 0 && (
        <View style={{
          position: "absolute",
          right: 0,
          top: -4,
          backgroundColor: Colors.accent,
          borderRadius: 9,
          minWidth: 17,
          height: 17,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 2,
          borderColor: Colors.bg,
          paddingHorizontal: 3,
        }}>
          <Text style={{ color: "#fff", fontSize: 9, fontWeight: "800", lineHeight: 13 }}>
            {count > 99 ? "99+" : String(count)}
          </Text>
        </View>
      )}
    </View>
  );
}

function NativeTabLayout() {
  const { conversations, incomingUnlockRequests, unreadNotificationCount } = useApp();
  const totalUnread = conversations.reduce((a, c) => a + c.unreadCount, 0);
  const messagesBadgeCount = totalUnread + incomingUnlockRequests.length;
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "map", selected: "map.fill" }} />
        <Label>Radar</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="browse">
        <Icon sf={{ default: "person.2", selected: "person.2.fill" }} />
        <Label>Nearby</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="messages">
        <Icon sf={{ default: "message", selected: "message.fill" }} />
        <Label>Messages</Label>
        {messagesBadgeCount > 0 && <Badge>{String(messagesBadgeCount)}</Badge>}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <Icon sf={{ default: "person", selected: "person.fill" }} />
        <Label>Profile</Label>
        {unreadNotificationCount > 0 && <Badge>{String(unreadNotificationCount)}</Badge>}
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const { conversations, incomingUnlockRequests, unreadNotificationCount } = useApp();
  const totalUnread = conversations.reduce((a, c) => a + c.unreadCount, 0);
  const messagesBadgeCount = totalUnread + incomingUnlockRequests.length;
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  return (
    <Tabs
      screenListeners={{
        tabPress: () => {
          if (Platform.OS !== "web") Haptics.selectionAsync();
        },
      }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: "#4E4E72",
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : Colors.bgCard,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: Colors.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.bgCard }]} />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Radar",
          tabBarIcon: ({ color, size }) => <Ionicons name="map" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="browse"
        options={{
          title: "Nearby",
          tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Messages",
          tabBarIcon: ({ color, size }) => (
            <IconWithDotBadge name="chatbubbles" color={color} size={size} count={messagesBadgeCount} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
          tabBarBadge: unreadNotificationCount > 0 ? unreadNotificationCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: Colors.accent,
            color: "#fff",
            fontSize: 12,
            fontWeight: "700",
            minWidth: 20,
            height: 20,
            lineHeight: 20,
            borderRadius: 10,
            borderWidth: 2,
            borderColor: Colors.bg,
            paddingHorizontal: 6,
          },
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  return (
    <View style={{ flex: 1 }}>
      {isLiquidGlassAvailable() ? <NativeTabLayout /> : <ClassicTabLayout />}
      <UnlockRequestToast />
      <NotificationToast />
      <RadarEntrantToast />
    </View>
  );
}
