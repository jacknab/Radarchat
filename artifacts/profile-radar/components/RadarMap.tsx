import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { NearbyUser } from "@/contexts/AppContext";

interface Props {
  region: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
  userLocation: { latitude: number; longitude: number } | null;
  locationGranted: boolean | null;
  nearbyUsers: NearbyUser[];
  selectedUserId?: string;
  onMarkerPress: (user: NearbyUser) => void;
  mapRef?: React.RefObject<any>;
}

export default function RadarMap(_props: Props) {
  return (
    <View style={styles.container}>
      <Ionicons name="map" size={48} color={Colors.textMuted} />
      <Text style={styles.text}>Map view available on mobile</Text>
      <Text style={styles.sub}>Scan the QR code with Expo Go to use the map</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, alignItems: "center", justifyContent: "center",
    backgroundColor: Colors.bgCard, gap: 12,
  },
  text: { fontSize: 18, fontWeight: "600", color: Colors.textSecondary, fontFamily: "Inter_600SemiBold" },
  sub: { fontSize: 14, color: Colors.textMuted, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 40 },
});
