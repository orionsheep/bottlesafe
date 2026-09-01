export const MIX_SESSION_KEY = "bottlesafe-mix-session";
const SESSION_MAX = 8;

export type MixSessionItem = {
  key: string;
  name: string;
  risk_level: string;
  image_path?: string;
  analysis: Record<string, unknown>;
};

export function loadMixSession(): MixSessionItem[] {
  try {
    const raw = sessionStorage.getItem(MIX_SESSION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<Partial<MixSessionItem>>;
    return parsed
      .filter((x) => x && x.analysis)
      .map((x, i) => ({
        key: x.key || `scan:${i}`,
        name: x.name || "未命名",
        risk_level: x.risk_level || "unknown",
        image_path: x.image_path,
        analysis: x.analysis as Record<string, unknown>,
      }));
  } catch {
    return [];
  }
}

export function pushMixSession(item: Omit<MixSessionItem, "key"> & { key?: string }) {
  const key = item.key || `scan:${Date.now()}`;
  const next: MixSessionItem = { ...item, key };
  const prev = loadMixSession().filter((x) => x.key !== key && x.name !== next.name);
  sessionStorage.setItem(MIX_SESSION_KEY, JSON.stringify([next, ...prev].slice(0, SESSION_MAX)));
}
