export function formatLastSeen(lastSeen: number, isOnline: boolean): string {
  if (isOnline) return "Online now";
  if (!lastSeen || lastSeen === 0) return "Offline";
  const diffMs = Date.now() - lastSeen;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 2) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMs / 3_600_000);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return "Over a week ago";
}

export function formatLastSeenShort(lastSeen: number, isOnline: boolean): string {
  if (isOnline) return "now";
  if (!lastSeen || lastSeen === 0) return "–";
  const diffMs = Date.now() - lastSeen;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 2) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHours = Math.floor(diffMs / 3_600_000);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays < 7) return `${diffDays}d`;
  return "7d+";
}
