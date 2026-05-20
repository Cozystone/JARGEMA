import { distance } from "./geometry";
import type { Landmark } from "./types";

const EYE = {
  left: [33, 160, 158, 133, 153, 144],
  right: [362, 385, 387, 263, 373, 380],
} as const;

export function calculateEAR(landmarks: Landmark[], side: keyof typeof EYE) {
  const [p1, p2, p3, p4, p5, p6] = EYE[side].map((index) => landmarks[index]);
  if (!p1 || !p2 || !p3 || !p4 || !p5 || !p6) return 0;
  const vertical = distance(p2, p6) + distance(p3, p5);
  const horizontal = 2 * distance(p1, p4);
  return horizontal === 0 ? 0 : vertical / horizontal;
}
