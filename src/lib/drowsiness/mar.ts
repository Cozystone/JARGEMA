import { distance } from "./geometry";
import type { Landmark } from "./types";

const MOUTH = [61, 185, 40, 39, 291, 375, 321, 405] as const;

export function calculateMAR(landmarks: Landmark[]) {
  const [p1, p2, p3, p4, p5, p6, p7, p8] = MOUTH.map((index) => landmarks[index]);
  if (!p1 || !p2 || !p3 || !p4 || !p5 || !p6 || !p7 || !p8) return 0;
  const vertical = distance(p2, p8) + distance(p3, p7) + distance(p4, p6);
  const horizontal = 2 * distance(p1, p5);
  return horizontal === 0 ? 0 : vertical / horizontal;
}

export class YawnTracker {
  private startedAt = 0;

  update(mar: number, now = Date.now()) {
    if (mar > 0.6) {
      if (!this.startedAt) this.startedAt = now;
      return now - this.startedAt >= 1500;
    }
    this.startedAt = 0;
    return false;
  }
}
