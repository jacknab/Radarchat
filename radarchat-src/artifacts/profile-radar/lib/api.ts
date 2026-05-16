import { Platform } from "react-native";

function resolveBaseUrl(): string {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return window.location.origin;
  }
  const nativeDomain = process.env.EXPO_PUBLIC_API_DOMAIN;
  if (nativeDomain) {
    return nativeDomain.startsWith("http") ? nativeDomain : `https://${nativeDomain}`;
  }
  const envDomain = process.env.EXPO_PUBLIC_DOMAIN;
  if (envDomain) {
    return envDomain.startsWith("http") ? envDomain : `https://${envDomain}`;
  }
  return "http://localhost:5000";
}

export const API_BASE = resolveBaseUrl();

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; token?: string | null } = {}
): Promise<T> {
  const { method = "GET", body, token } = opts;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["X-User-Token"] = token;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json())?.error ?? "";
    } catch {}
    throw new Error(`API ${method} ${path} ${res.status}${detail ? ": " + detail : ""}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function resolvePhotoUri(uri: string | undefined | null): string {
  if (!uri) return "";
  if (uri.startsWith("/")) return `${API_BASE}${uri}`;
  return uri;
}

function guessMimeFromUri(uri: string): string {
  const lower = uri.toLowerCase().split("?")[0];
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

async function blobToBase64(blob: Blob): Promise<{ data: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.onloadend = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      const data = comma >= 0 ? result.slice(comma + 1) : result;
      resolve({ data, mime: blob.type || "image/jpeg" });
    };
    reader.readAsDataURL(blob);
  });
}

export async function uploadPhoto(
  uri: string,
  token: string,
  base64?: string | null,
): Promise<{ url: string; thumbnailUrl: string }> {
  let data: string;
  let mime: string;
  if (base64 && base64.length > 0) {
    data = base64;
    mime = guessMimeFromUri(uri);
  } else if (uri.startsWith("data:")) {
    const [head, payload] = uri.split(",", 2);
    mime = head.slice(5, head.indexOf(";"));
    data = payload;
  } else {
    const res = await fetch(uri);
    if (!res.ok) throw new Error(`Failed to read picked image (${res.status})`);
    const blob = await res.blob();
    const r = await blobToBase64(blob);
    data = r.data;
    mime = r.mime || guessMimeFromUri(uri);
  }
  const out = await api<{ url: string; thumbnailUrl?: string }>(`/api/upload`, {
    method: "POST",
    token,
    body: { data, mime },
  });
  return { url: out.url, thumbnailUrl: out.thumbnailUrl ?? out.url };
}
