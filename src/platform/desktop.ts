import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Area, Point } from "../physics/world";
import type { Settings } from "../settings/schema";
export const desktop = isTauri();
export interface Snapshot {
  cursor: Point;
  local: Point;
  leftDown: boolean;
  areas: Area[];
  scale: number;
  pet: Point;
  visible: boolean;
}
export const call = <T>(command: string, args?: Record<string, unknown>) =>
  invoke<T>(command, args);
export const on = <T>(name: string, fn: (data: T) => void) =>
  listen<T>(name, (event) => fn(event.payload));
export const readSettings = () => call<Settings>("get_settings");
