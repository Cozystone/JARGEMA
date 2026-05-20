import type { Landmark } from "./types";

export function distance(a: Landmark, b: Landmark) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}
