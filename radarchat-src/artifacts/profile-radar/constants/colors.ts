const ACCENT = "#FF7A00";
const ACCENT_SECONDARY = "#6C5CE7";
const ONLINE = "#00E676";
const LOCKED = "#FF9800";

export const Colors = {
  bg: "#080810",
  bgCard: "#12121E",
  bgCardLight: "#1A1A2E",
  border: "#1E1E35",
  borderLight: "#2A2A45",
  accent: ACCENT,
  accentSecondary: ACCENT_SECONDARY,
  accentGlow: "rgba(255, 122, 0, 0.15)",
  text: "#FFFFFF",
  textSecondary: "#8888BB",
  textMuted: "#555577",
  online: ONLINE,
  onlineGlow: "rgba(0, 230, 118, 0.2)",
  locked: LOCKED,
  lockedGlow: "rgba(255, 152, 0, 0.15)",
  danger: "#FF7A00",
  success: ONLINE,
  overlay: "rgba(0, 0, 0, 0.75)",
  mapPin: ACCENT,
};

export default {
  light: {
    text: Colors.text,
    background: Colors.bg,
    tint: Colors.accent,
    tabIconDefault: Colors.textMuted,
    tabIconSelected: Colors.accent,
  },
};
