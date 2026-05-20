import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
  Image,
  Animated,
} from "react-native";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { useApp, NearbyUser } from "@/contexts/AppContext";
import RadarMap from "@/components/RadarMap";
import { resolvePhotoUri } from "@/lib/api";

function formatDistance(miles: number): string {
  const feet = Math.round(miles * 5280);
  if (feet < 5280) return `${feet} ft`;
  return `${miles.toFixed(1)} mi`;
}

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { myProfile, nearbyUsers, saveProfile, refreshNearbyUsers, isLoading } = useApp();
  const [locationGranted, setLocationGranted] = useState<boolean | null>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [selectedUser, setSelectedUser] = useState<NearbyUser | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const mapRef = useRef<any>(null);
  const spinAnim = useRef(new Animated.Value(0)).current;
  const spinLoop = useRef<Animated.CompositeAnimation | null>(null);

  function doRefresh() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    Haptics.selectionAsync();
    spinLoop.current = Animated.loop(
      Animated.timing(spinAnim, { toValue: 1, duration: 650, useNativeDriver: true })
    );
    spinLoop.current.start();
    if (userLocation) {
      refreshNearbyUsers(userLocation.latitude, userLocation.longitude);
    } else {
      requestLocation();
    }
    setTimeout(() => {
      spinLoop.current?.stop();
      spinAnim.setValue(0);
      setIsRefreshing(false);
    }, 1400);
  }

  useEffect(() => {
    if (!isLoading) {
      requestLocation();
    }
  }, [isLoading]);

  async function requestLocation() {
    const perm = await Location.requestForegroundPermissionsAsync();
    setLocationGranted(perm.granted);
    if (perm.granted) {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setUserLocation(coords);
      if (myProfile) {
        await saveProfile({ ...myProfile, latitude: coords.latitude, longitude: coords.longitude });
      } else {
        refreshNearbyUsers(coords.latitude, coords.longitude);
      }
      mapRef.current?.animateToRegion({ ...coords, latitudeDelta: 0.018, longitudeDelta: 0.018 }, 1000);
    } else if (myProfile?.latitude && myProfile?.longitude) {
      setUserLocation({ latitude: myProfile.latitude, longitude: myProfile.longitude });
    } else {
      const fallback = { latitude: 39.7285, longitude: -104.9777 };
      setUserLocation(fallback);
      refreshNearbyUsers(fallback.latitude, fallback.longitude);
    }
  }

  const mapCenter: { latitude: number; longitude: number } = userLocation
    ?? (myProfile?.latitude != null && myProfile?.longitude != null
      ? { latitude: myProfile.latitude, longitude: myProfile.longitude }
      : { latitude: 39.7285, longitude: -104.9777 });

  const mapRegion = { ...mapCenter, latitudeDelta: 0.018, longitudeDelta: 0.018 };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <RadarMap
        region={mapRegion}
        userLocation={userLocation}
        locationGranted={locationGranted}
        nearbyUsers={nearbyUsers}
        selectedUserId={selectedUser?.id}
        onMarkerPress={(user) => {
          Haptics.selectionAsync();
          setSelectedUser(user);
        }}
        mapRef={mapRef}
        topPadding={insets.top + 52}
      />

      {/* Floating refresh button — top right */}
      <View style={[styles.floatingRefresh, { top: insets.top + 8 }]} pointerEvents="box-none">
        <Pressable
          style={[styles.refreshBtn, isRefreshing && styles.refreshBtnActive]}
          onPress={doRefresh}
        >
          <Animated.View style={{
            transform: [{
              rotate: spinAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] })
            }]
          }}>
            <Ionicons name="refresh" size={18} color={isRefreshing ? Colors.accent : Colors.text} />
          </Animated.View>
        </Pressable>
      </View>

      {selectedUser && (
        <View style={[styles.userCard, { bottom: insets.bottom + (Platform.OS === "web" ? 84 : 90) }]}>
          <Pressable
            style={styles.userCardInner}
            onPress={() => {
              router.push({ pathname: "/user/[id]", params: { id: selectedUser.id } });
              setSelectedUser(null);
            }}
          >
            <View style={styles.userCardAvatar}>
              {(() => {
                const publicPhoto = selectedUser.photos.find((p) => !p.isLocked);
                return publicPhoto ? (
                  <Image
                    source={{ uri: resolvePhotoUri(publicPhoto.uri) }}
                    style={styles.userCardAvatarImage}
                  />
                ) : (
                  <Text style={styles.userCardAvatarText}>{selectedUser.name[0]}</Text>
                );
              })()}
            </View>
            <View style={styles.userCardInfo}>
              <View style={styles.userCardNameRow}>
                <Text style={styles.userCardName}>{selectedUser.name}, {selectedUser.age}</Text>
                <View style={[styles.statusDot, selectedUser.isOnline && styles.statusDotOnline]} />
              </View>
              <Text style={styles.userCardMeta}>{formatDistance(selectedUser.distanceMiles)} · {selectedUser.lookingFor}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </Pressable>
          <Pressable style={styles.closeCardBtn} onPress={() => setSelectedUser(null)}>
            <Ionicons name="close" size={16} color={Colors.textSecondary} />
          </Pressable>
        </View>
      )}

      {locationGranted === false && (
        <View style={[styles.locationDenied, { bottom: insets.bottom + (Platform.OS === "web" ? 84 : 90) }]}>
          <Ionicons name="location-outline" size={18} color={Colors.locked} />
          <Text style={styles.locationDeniedText}>Enable location to see nearby users</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.bg },
  header: {
    position: "absolute", top: 0, left: 0, right: 0,
    paddingHorizontal: 20, paddingBottom: 12, gap: 8,
  },
  headerContent: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(8, 8, 16, 0.85)",
    borderRadius: 16, paddingHorizontal: 18, paddingVertical: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  headerLeft: { flexDirection: "column", gap: 2 },
  headerTitle: { fontSize: 20, fontWeight: "700", color: Colors.text, fontFamily: "Inter_700Bold" },
  onlineBadge: { flexDirection: "row", alignItems: "center", gap: 6 },
  onlineDotSmall: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.online },
  onlineCount: { fontSize: 12, color: Colors.textSecondary, fontFamily: "Inter_400Regular" },
  floatingRefresh: {
    position: "absolute", right: 16,
  },
  refreshBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: "rgba(8,8,16,0.85)", alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: Colors.border,
  },
  refreshBtnActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentGlow,
  },

  // Go Live / Live bar
  goLiveBar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(8, 8, 16, 0.88)",
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 11,
    borderWidth: 1, borderColor: Colors.accent,
  },
  goLiveBarActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  goLiveBarText: {
    flex: 1, fontSize: 13, fontWeight: "600", color: Colors.accent, fontFamily: "Inter_600SemiBold",
  },
  liveBar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(6, 214, 160, 0.12)",
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 11,
    borderWidth: 1, borderColor: Colors.online,
  },
  liveDot: {
    width: 9, height: 9, borderRadius: 5,
    backgroundColor: Colors.online,
    shadowColor: Colors.online, shadowOpacity: 0.8, shadowRadius: 4, shadowOffset: { width: 0, height: 0 },
  },
  liveBarText: {
    flex: 1, fontSize: 13, fontWeight: "600", color: Colors.online, fontFamily: "Inter_600SemiBold",
  },
  goOfflineBtn: {
    backgroundColor: "rgba(0,0,0,0.4)", borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: Colors.online,
  },
  goOfflineBtnText: { fontSize: 11, color: Colors.online, fontFamily: "Inter_600SemiBold" },

  // User card popup
  userCard: {
    position: "absolute", left: 16, right: 16,
    backgroundColor: Colors.bgCard, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.border,
    overflow: "hidden",
  },
  userCardInner: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14, gap: 14,
  },
  userCardAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center",
    overflow: "hidden",
  },
  userCardAvatarImage: { width: 48, height: 48 },
  userCardAvatarText: { fontSize: 20, fontWeight: "700", color: "#fff", fontFamily: "Inter_700Bold" },
  userCardInfo: { flex: 1 },
  userCardNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  userCardName: { fontSize: 16, fontWeight: "600", color: Colors.text, fontFamily: "Inter_600SemiBold" },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.textMuted },
  statusDotOnline: { backgroundColor: Colors.online },
  userCardMeta: { fontSize: 13, color: Colors.textSecondary, fontFamily: "Inter_400Regular", marginTop: 2 },
  closeCardBtn: {
    position: "absolute", top: 10, right: 14,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: Colors.bgCardLight, alignItems: "center", justifyContent: "center",
  },
  locationDenied: {
    position: "absolute", left: 16, right: 16,
    backgroundColor: Colors.bgCard, borderRadius: 14,
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  locationDeniedText: { fontSize: 13, color: Colors.locked, fontFamily: "Inter_400Regular" },
});
