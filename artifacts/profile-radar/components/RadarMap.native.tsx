import React, { useRef, useEffect } from "react";
import { StyleSheet, View, Text, Image } from "react-native";
import MapView, { Marker, Circle, Region } from "react-native-maps";
import { Colors } from "@/constants/colors";
import { NearbyUser } from "@/contexts/AppContext";
import { resolvePhotoUri } from "@/lib/api";

const MAP_DELTA = 0.038;

interface Props {
  region: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
  userLocation: { latitude: number; longitude: number } | null;
  locationGranted: boolean | null;
  nearbyUsers: NearbyUser[];
  selectedUserId?: string;
  onMarkerPress: (user: NearbyUser) => void;
  mapRef?: React.RefObject<MapView>;
  topPadding?: number;
}

const darkMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#0A0A14" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#444466" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#080810" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#16163A" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#0E0E28" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#1E1E50" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#05050F" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#0E0E22" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#0E0E22" }] },
];

export default function RadarMap({ region, userLocation, locationGranted, nearbyUsers, selectedUserId, onMarkerPress, mapRef, topPadding = 0 }: Props) {
  const centerLocation = userLocation ?? (region.latitude ? { latitude: region.latitude, longitude: region.longitude } : null);

  const lastAnimatedRef = useRef<{ lat: number; lon: number } | null>(null);

  const initialRegion: Region = {
    latitude: region.latitude,
    longitude: region.longitude,
    latitudeDelta: MAP_DELTA,
    longitudeDelta: MAP_DELTA,
  };

  useEffect(() => {
    const { latitude, longitude } = region;
    if (!latitude || !longitude) return;
    const last = lastAnimatedRef.current;
    const same = last && Math.abs(last.lat - latitude) < 0.00001 && Math.abs(last.lon - longitude) < 0.00001;
    if (same) return;
    lastAnimatedRef.current = { lat: latitude, lon: longitude };
    mapRef?.current?.animateToRegion({ latitude, longitude, latitudeDelta: MAP_DELTA, longitudeDelta: MAP_DELTA }, 600);
  }, [region.latitude, region.longitude]);

  const visibleUsers = nearbyUsers.filter((u) => u.isMe || u.isOnline);

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      initialRegion={initialRegion}
      mapType="mutedStandard"
      showsUserLocation={false}
      showsMyLocationButton={false}
      showsCompass={false}
      showsScale={false}
      scrollEnabled={true}
      zoomEnabled={true}
      rotateEnabled={false}
      pitchEnabled={false}
      zoomTapEnabled={true}
      customMapStyle={darkMapStyle}
      mapPadding={{ top: topPadding, right: 0, bottom: 0, left: 0 }}
    >
      {centerLocation && (
        <Circle
          center={centerLocation}
          radius={16093}
          fillColor="rgba(255, 122, 0, 0.06)"
          strokeColor="rgba(255, 122, 0, 0.3)"
          strokeWidth={1.5}
        />
      )}
      {visibleUsers.map((user) => {
        const publicPhoto = user.photos.find((p) => !p.isLocked);
        const pinUri = publicPhoto ? resolvePhotoUri(publicPhoto.thumbnailUri ?? publicPhoto.uri) : null;
        const isSelected = selectedUserId === user.id;

        if (user.isMe) {
          return (
            <Marker
              key={user.id}
              coordinate={{ latitude: user.latitude, longitude: user.longitude }}
              onPress={() => onMarkerPress(user)}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={isSelected}
            >
              <View style={[styles.mePinWrapper, isSelected && styles.mapPinSelected]}>
                <View style={styles.mePinInner}>
                  {pinUri ? (
                    <Image source={{ uri: pinUri }} style={styles.pinImage} />
                  ) : (
                    <Text style={styles.mePinText}>{user.name[0]}</Text>
                  )}
                </View>
                <View style={styles.mePulse} />
                <View style={styles.youLabel}>
                  <Text style={styles.youLabelText}>YOU</Text>
                </View>
              </View>
            </Marker>
          );
        }

        return (
          <Marker
            key={user.id}
            coordinate={{ latitude: user.latitude, longitude: user.longitude }}
            onPress={() => onMarkerPress(user)}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={isSelected}
          >
            <View style={[styles.mapPin, isSelected && styles.mapPinSelected]}>
              <View style={styles.mapPinInner}>
                {pinUri ? (
                  <Image source={{ uri: pinUri }} style={styles.pinImage} />
                ) : (
                  <Text style={styles.mapPinText}>{user.name[0]}</Text>
                )}
              </View>
              <View style={styles.onlineDot} />
            </View>
          </Marker>
        );
      })}
    </MapView>
  );
}

const styles = StyleSheet.create({
  mapPin: { alignItems: "center", justifyContent: "center" },
  mapPinSelected: { transform: [{ scale: 1.2 }] },
  mapPinInner: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.accent, alignItems: "center",
    justifyContent: "center", borderWidth: 2, borderColor: "#fff",
    shadowColor: Colors.accent, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8, shadowRadius: 8, elevation: 8,
    overflow: "hidden",
  },
  pinImage: { width: "100%", height: "100%" },
  mapPinText: { fontSize: 13, fontWeight: "700", color: "#fff", fontFamily: "Inter_700Bold" },
  onlineDot: {
    position: "absolute", bottom: 1, right: 1,
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: Colors.online, borderWidth: 1.5, borderColor: "#fff",
    zIndex: 1,
  },
  // "YOU" marker styles
  mePinWrapper: { alignItems: "center", gap: 4 },
  mePinInner: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: "#fff", alignItems: "center",
    justifyContent: "center", borderWidth: 3, borderColor: Colors.accent,
    shadowColor: "#fff", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6, shadowRadius: 10, elevation: 10,
    overflow: "hidden",
  },
  mePulse: {
    position: "absolute",
    width: 64, height: 64, borderRadius: 32,
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.25)",
  },
  mePinText: { fontSize: 14, fontWeight: "700", color: Colors.accent, fontFamily: "Inter_700Bold" },
  youLabel: {
    backgroundColor: "#fff",
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4, shadowRadius: 3, elevation: 4,
  },
  youLabelText: {
    fontSize: 9, fontWeight: "800", color: Colors.accent,
    fontFamily: "Inter_700Bold", letterSpacing: 0.5,
  },
});
