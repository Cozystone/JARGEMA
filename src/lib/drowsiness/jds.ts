import { clamp } from "./geometry";
import type { DrowsinessMetrics, JdsLevel, JdsResult } from "./types";

export function calculateJDS(metrics: DrowsinessMetrics): JdsResult {
  if (metrics.observedSeconds < 1 || metrics.baselineEAR === 0) {
    return describeJDS(0);
  }

  let score = 0;

  score += Math.min(metrics.perclos * 1.35, 40);

  if (metrics.observedSeconds >= 8 && metrics.blinkRate < 8 && !metrics.longEyeClosure) score += 10;
  else if (metrics.observedSeconds >= 8 && metrics.blinkRate < 12 && !metrics.longEyeClosure) score += 6;
  else if (metrics.blinkRate > 30) score += 14;

  if (metrics.microsleepDuration > 3000) score += 34;
  else if (metrics.microsleepDuration > 1800) score += 26;
  else if (metrics.blinkDuration > 900) score += 16;
  else if (metrics.blinkDuration > 500) score += 5;

  if (metrics.yawnDetected) score += 15;

  if (metrics.headPitch > 24) score += 14;
  else if (metrics.headPitch > 14) score += 8;
  if (metrics.headDrop > 22) score += 22;
  else if (metrics.headDrop > 14) score += 14;
  else if (metrics.headDrop > 8) score += 7;
  if (metrics.nodDetected) score += 18;
  if (metrics.gradualHeadDrop) score += 12;
  if (Math.abs(metrics.headRoll) > 15) score += 4;

  if (metrics.eyeClosureRatio > 0.9) score += 26;
  else if (metrics.eyeClosureRatio > 0.75) score += 18;
  else if (metrics.eyeClosureRatio > 0.55) score += 10;

  if (metrics.consecutiveClosed > 120) score += 18;
  else if (metrics.consecutiveClosed > 75) score += 12;
  else if (metrics.consecutiveClosed > 45) score += 6;

  if (metrics.microsleepDuration > 2500 && metrics.eyeClosureRatio > 0.8) score += 14;
  if (metrics.gazeDown && metrics.eyeClosureRatio > 0.55) score += 8;

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
