import { clamp } from "./geometry";
import type { DrowsinessMetrics, JdsLevel, JdsResult } from "./types";

export function calculateJDS(metrics: Omit<DrowsinessMetrics, "avgEAR" | "mar">): JdsResult {
  let score = 0;

  score += Math.min(metrics.perclos * 1.2, 35);

  if (metrics.blinkRate < 8) score += 20;
  else if (metrics.blinkRate < 12) score += 12;
  else if (metrics.blinkRate > 30) score += 15;

  if (metrics.blinkDuration > 2000) score += 15;
  else if (metrics.blinkDuration > 800) score += 10;
  else if (metrics.blinkDuration > 500) score += 5;

  if (metrics.yawnDetected) score += 15;

  if (metrics.headPitch > 25) score += 10;
  else if (metrics.headPitch > 15) score += 6;
  if (Math.abs(metrics.headRoll) > 15) score += 4;

  if (metrics.consecutiveClosed > 90) score += 5;

  return describeJDS(Math.round(clamp(score, 0, 100)));
}

export function describeJDS(score: number): JdsResult {
  let level: JdsLevel = "AWAKE";
  let color = "#00FF88";

  if (score >= 80) {
    level = "ASLEEP";
    color = "#FF0000";
  } else if (score >= 60) {
    level = "DROWSY_HIGH";
    color = "#FF4500";
  } else if (score >= 40) {
    level = "DROWSY_MED";
    color = "#FF8C00";
  } else if (score >= 20) {
    level = "DROWSY_LOW";
    color = "#FFD700";
  }

  return { score, level, color };
}
