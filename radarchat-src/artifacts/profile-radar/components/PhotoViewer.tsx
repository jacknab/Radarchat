import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  StatusBar,
  Platform,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import {
  GestureDetector,
  Gesture,
  ScrollView as GHScrollView,
} from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { resolvePhotoUri } from "@/lib/api";

type Props = {
  visible: boolean;
  photos: { id?: string; uri: string }[];
  initialIndex?: number;
  onClose: () => void;
};

const MAX_SCALE = 4;
const MIN_SCALE = 1;
const DOUBLE_TAP_SCALE = 2.5;

export default function PhotoViewer({
  visible,
  photos,
  initialIndex = 0,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<GHScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [winSize, setWinSize] = useState(() => {
    const { width, height } = Dimensions.get("window");
    return { width, height };
  });

  // Listen for dimension changes (rotation, web resize).
  useEffect(() => {
    const sub = Dimensions.addEventListener("change", ({ window }) => {
      setWinSize({ width: window.width, height: window.height });
    });
    return () => sub.remove();
  }, []);

  // Reset state when opening.
  useEffect(() => {
    if (visible) {
      setActiveIndex(initialIndex);
      // jump scroll to initial page after layout
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({
          x: initialIndex * winSize.width,
          animated: false,
        });
      });
    }
  }, [visible, initialIndex, winSize.width]);

  if (photos.length === 0) return null;

  function handleScrollEnd(e: { nativeEvent: { contentOffset: { x: number } } }) {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / winSize.width);
    if (idx !== activeIndex && idx >= 0 && idx < photos.length) {
      setActiveIndex(idx);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar
        barStyle="light-content"
        backgroundColor="#000"
        translucent={false}
      />
      <View style={styles.root}>
        <GHScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScrollEnd}
          // On web onMomentumScrollEnd may not fire; use onScrollEndDrag too.
          onScrollEndDrag={handleScrollEnd}
          bounces={false}
          style={{ flex: 1 }}
        >
          {photos.map((p, i) => (
            <ZoomablePage
              key={p.id ?? `${p.uri}-${i}`}
              uri={p.uri}
              width={winSize.width}
              height={winSize.height}
            />
          ))}
        </GHScrollView>

        {/* Top bar */}
        <View
          pointerEvents="box-none"
          style={[styles.topBar, { paddingTop: insets.top + 6 }]}
        >
          <View style={styles.counterPill}>
            <Text style={styles.counterText}>
              {activeIndex + 1} / {photos.length}
            </Text>
          </View>
          <Pressable hitSlop={12} onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
        </View>

        {/* Bottom hint */}
        <View
          pointerEvents="none"
          style={[styles.bottomHint, { paddingBottom: insets.bottom + 14 }]}
        >
          <Text style={styles.hintText}>
            {photos.length > 1 ? "Swipe • " : ""}Pinch to zoom • Double-tap
          </Text>
        </View>
      </View>
    </Modal>
  );
}

function ZoomablePage({
  uri,
  width,
  height,
}: {
  uri: string;
  width: number;
  height: number;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  function reset() {
    "worklet";
    scale.value = withTiming(1, { duration: 200 });
    savedScale.value = 1;
    tx.value = withTiming(0, { duration: 200 });
    ty.value = withTiming(0, { duration: 200 });
    savedTx.value = 0;
    savedTy.value = 0;
  }

  // Clamp translation so the image doesn't fly off-screen when zoomed.
  function clampTranslations() {
    "worklet";
    const s = scale.value;
    const maxX = (width * (s - 1)) / 2;
    const maxY = (height * (s - 1)) / 2;
    if (tx.value > maxX) tx.value = withTiming(maxX, { duration: 120 });
    if (tx.value < -maxX) tx.value = withTiming(-maxX, { duration: 120 });
    if (ty.value > maxY) ty.value = withTiming(maxY, { duration: 120 });
    if (ty.value < -maxY) ty.value = withTiming(-maxY, { duration: 120 });
  }

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      const next = savedScale.value * e.scale;
      scale.value = Math.min(Math.max(next, MIN_SCALE * 0.85), MAX_SCALE);
    })
    .onEnd(() => {
      if (scale.value < MIN_SCALE) {
        reset();
      } else {
        savedScale.value = scale.value;
        clampTranslations();
      }
    });

  const pan = Gesture.Pan()
    .minPointers(1)
    .maxPointers(2)
    .averageTouches(true)
    .onUpdate((e) => {
      // Only allow pan when zoomed in. When not zoomed, the parent ScrollView
      // handles horizontal swipe between photos.
      if (scale.value <= 1.01) return;
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
    })
    .onEnd(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
      clampTranslations();
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(280)
    .onEnd(() => {
      if (scale.value > 1.05) {
        reset();
      } else {
        scale.value = withTiming(DOUBLE_TAP_SCALE, { duration: 220 });
        savedScale.value = DOUBLE_TAP_SCALE;
      }
    });

  const composed = Gesture.Simultaneous(pinch, pan, doubleTap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  return (
    <View style={[styles.page, { width, height }]}>
      <GestureDetector gesture={composed}>
        <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
          <ExpoImage
            source={{ uri: resolvePhotoUri(uri) }}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            cachePolicy="memory-disk"
            transition={120}
          />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },
  page: {
    overflow: "hidden",
    backgroundColor: "#000",
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  counterPill: {
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  counterText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  bottomHint: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  hintText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    backgroundColor: "rgba(0,0,0,0.4)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: "hidden",
  },
});

// Suppress unused import warning when not on Platform-specific paths.
void Platform;
void runOnJS;
