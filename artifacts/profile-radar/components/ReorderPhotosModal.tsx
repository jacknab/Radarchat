import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from "react-native-draggable-flatlist";
import { Colors } from "@/constants/colors";
import { resolvePhotoUri } from "@/lib/api";
import type { Photo } from "@/contexts/AppContext";

type Props = {
  visible: boolean;
  isLocked: boolean;
  photos: Photo[];
  onClose: () => void;
  onSave: (orderedIds: string[]) => void;
};

export default function ReorderPhotosModal({
  visible,
  isLocked,
  photos,
  onClose,
  onSave,
}: Props) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Photo[]>(photos);

  useEffect(() => {
    if (visible) setItems(photos);
  }, [visible, photos]);

  const accent = isLocked ? Colors.locked : Colors.accent;

  function handleDone() {
    onSave(items.map((p) => p.id));
    onClose();
  }

  function renderItem({ item, drag, isActive, getIndex }: RenderItemParams<Photo>) {
    const idx = getIndex();
    const isMain = !isLocked && idx === 0;
    return (
      <ScaleDecorator>
        <Pressable
          onLongPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            drag();
          }}
          delayLongPress={150}
          style={[
            styles.row,
            isActive && styles.rowActive,
          ]}
        >
          <View style={styles.thumbWrap}>
            <Image
              source={{ uri: resolvePhotoUri(item.uri) }}
              style={[styles.thumb, isLocked && { opacity: 0.45 }]}
              resizeMode="cover"
            />
            {isLocked ? (
              <View style={styles.lockOverlay}>
                <Ionicons name="lock-closed" size={16} color={Colors.locked} />
              </View>
            ) : null}
            {isMain ? (
              <View style={styles.mainBadge}>
                <Ionicons name="star" size={9} color="#fff" />
                <Text style={styles.mainBadgeText}>Main</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.rowInfo}>
            <Text style={styles.rowTitle}>
              {isMain ? "Main photo" : `Photo ${(idx ?? 0) + 1}`}
            </Text>
            <Text style={styles.rowHint}>
              {isMain
                ? "Shown on the radar"
                : "Long-press and drag to reorder"}
            </Text>
          </View>
          <View style={styles.dragHandle}>
            <Ionicons name="reorder-three" size={28} color={Colors.textSecondary} />
          </View>
        </Pressable>
      </ScaleDecorator>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + (Platform.OS === "web" ? 16 : 8) },
          ]}
        >
          <View style={styles.header}>
            <Pressable onPress={onClose} hitSlop={10} style={styles.headerBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <View style={styles.headerTitleWrap}>
              <Ionicons
                name={isLocked ? "lock-closed" : "images"}
                size={16}
                color={accent}
              />
              <Text style={styles.headerTitle}>
                Reorder {isLocked ? "Locked" : "Public"} Photos
              </Text>
            </View>
            <Pressable onPress={handleDone} hitSlop={10} style={styles.headerBtn}>
              <Text style={[styles.doneText, { color: accent }]}>Done</Text>
            </Pressable>
          </View>

          {items.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="images-outline" size={36} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>No photos to reorder yet.</Text>
            </View>
          ) : (
            <DraggableFlatList
              data={items}
              keyExtractor={(p) => p.id}
              renderItem={renderItem}
              onDragEnd={({ data }) => {
                Haptics.selectionAsync();
                setItems(data);
              }}
              contentContainerStyle={styles.listContent}
              activationDistance={Platform.OS === "web" ? 4 : 8}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.bg,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: "88%",
    minHeight: "55%",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  headerBtn: { minWidth: 60 },
  headerTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
  },
  cancelText: {
    fontSize: 15,
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium",
  },
  doneText: {
    fontSize: 15,
    fontWeight: "600",
    textAlign: "right",
    fontFamily: "Inter_600SemiBold",
  },
  listContent: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 24,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.bgCard,
    borderRadius: 14,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  rowActive: {
    transform: [{ scale: 1.02 }],
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    borderColor: Colors.accent,
  },
  thumbWrap: {
    width: 64,
    height: 64,
    borderRadius: 10,
    overflow: "hidden",
    position: "relative",
    backgroundColor: Colors.bg,
  },
  thumb: { width: "100%", height: "100%" },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  mainBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.accent,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  mainBadgeText: {
    fontSize: 9,
    color: "#fff",
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  rowInfo: { flex: 1 },
  rowTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
  },
  rowHint: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
    fontFamily: "Inter_400Regular",
  },
  dragHandle: { paddingHorizontal: 4 },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 60,
  },
  emptyText: { color: Colors.textSecondary, fontSize: 14 },
});
