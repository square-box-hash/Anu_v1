export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function groupByDay(chats: { id: string; updatedAt: number }[]) {
  const now = Date.now();
  const buckets: { label: string; items: typeof chats }[] = [
    { label: "Today", items: [] },
    { label: "Previous 7 days", items: [] },
    { label: "Older", items: [] },
  ];
  for (const chat of chats) {
    const age = now - chat.updatedAt;
    if (age < 86400000) buckets[0].items.push(chat);
    else if (age < 7 * 86400000) buckets[1].items.push(chat);
    else buckets[2].items.push(chat);
  }
  return buckets.filter((b) => b.items.length > 0);
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/**
 * Time-of-day greeting with the person's first name, so opening the app says
 * something other than "New chat". Falls back to the time alone when there is
 * no name to use.
 */
export function greetingFor(name?: string | null, now: Date = new Date()): string {
  const hour = now.getHours();
  const part =
    hour < 5 ? "Still up" : hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : hour < 22 ? "Evening" : "Late night";
  const clean = (name ?? "").trim();
  if (!clean) return part;
  const first = clean.split(/\s+/)[0];
  // "G Mandi" would greet as "G", which reads worse than the full name.
  const who = first.length > 1 ? first : clean;
  return `${part}, ${who}`;
}

export function titleFrom(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "New chat";
  return clean.length > 48 ? `${clean.slice(0, 48)}…` : clean;
}

/**
 * GFM column alignment (`|---:|`) arrives as align="left|center|right" (plus
 * the HTML-only "justify"/"char", which are not CSS text-align values).
 */
export function textAlignFor(align?: string | null): "left" | "center" | "right" | undefined {
  return align === "left" || align === "center" || align === "right" ? align : undefined;
}

/**
 * Table cells carry their alignment on the hast node (`node.properties.align`),
 * not as a React prop, so read it from there.
 */
export function cellAlignFrom(node?: { properties?: Record<string, unknown> } | null): "left" | "center" | "right" | undefined {
  const align = node?.properties?.align;
  return typeof align === "string" ? textAlignFor(align) : undefined;
}
