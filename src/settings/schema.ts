export interface Settings {
  size: number;
  activity: number;
  sound: boolean;
  alwaysOnTop: boolean;
  autostart: boolean;
  paused: boolean;
}
export const defaults: Settings = {
  size: 240,
  activity: 0.45,
  sound: false,
  alwaysOnTop: true,
  autostart: false,
  paused: false,
};
export function sanitizeSettings(v: Partial<Settings>): Settings {
  const num = (x: unknown, d: number, min: number, max: number) =>
    typeof x === "number" && Number.isFinite(x)
      ? Math.min(max, Math.max(min, x))
      : d;
  const bool = (x: unknown, d: boolean) => (typeof x === "boolean" ? x : d);
  return {
    size: num(v.size, 240, 130, 340),
    activity: num(v.activity, 0.45, 0, 1),
    sound: bool(v.sound, false),
    alwaysOnTop: bool(v.alwaysOnTop, true),
    autostart: bool(v.autostart, false),
    paused: bool(v.paused, false),
  };
}
