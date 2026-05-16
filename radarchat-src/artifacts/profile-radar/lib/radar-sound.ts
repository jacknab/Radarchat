import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

export function playRadarPing() {
  if (Platform.OS === "web") {
    try {
      const AudioCtx =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx() as AudioContext;

      // Two ascending tones — a classic "radar ping" shape
      const tones: [number, number][] = [
        [880, 0],
        [1320, 0.18],
      ];
      for (const [freq, delay] of tones) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, ctx.currentTime + delay);
        gain.gain.linearRampToValueAtTime(0.22, ctx.currentTime + delay + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.38);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.42);
      }
    } catch {}
  } else {
    // Native: double haptic pulse to get the user's attention
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setTimeout(
      () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
      220,
    );
  }
}
