import { Platform } from "react-native";

// ─── Web: synthesised 2-tone chime via Web Audio API ─────────────────────────
function playWebChime() {
  try {
    const AudioCtx =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx() as AudioContext;

    // A pleasant "new message" chime: two ascending sine tones
    const tones: [number, number, number][] = [
      [880, 0, 0.28],    // A5 — immediate
      [1320, 0.17, 0.38], // E6 — follows quickly
    ];
    for (const [freq, delay, toneDur] of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      const t0 = ctx.currentTime + delay;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.25, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + toneDur);
      osc.start(t0);
      osc.stop(t0 + toneDur + 0.02);
    }
  } catch {}
}

// ─── Native: play bundled WAV via expo-av ─────────────────────────────────────
let _soundModule: any = null;
let _sound: any = null;

async function getNativeSound() {
  if (!_soundModule) {
    _soundModule = await import("expo-av");
    await _soundModule.Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      allowsRecordingIOS: false,
      staysActiveInBackground: false,
    });
  }
  if (!_sound) {
    const { sound } = await _soundModule.Audio.Sound.createAsync(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("../assets/sounds/message-alert.wav"),
      { shouldPlay: false, volume: 1.0 },
    );
    _sound = sound;
  }
  return _sound;
}

// ─── Public API ───────────────────────────────────────────────────────────────
export async function playMessageAlert(): Promise<void> {
  if (Platform.OS === "web") {
    playWebChime();
    return;
  }
  try {
    const sound = await getNativeSound();
    // Rewind to start before playing so rapid messages each trigger the chime
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch (err) {
    console.warn("[sound] message alert failed:", err);
  }
}
