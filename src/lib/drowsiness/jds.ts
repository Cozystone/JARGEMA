import { clamp } from "./geometry";
import type { DrowsinessMetrics, JdsLevel, JdsResult } from "./types";

export function calculateJDS(metrics: DrowsinessMetrics): JdsResult {
  if (metrics.observedSeconds < 2 || metrics.baselineEAR === 0) {
    return describeJDS(0);
  }

  let score = 0;

  const perclosWeight = metrics.observedSeconds < 10 ? 0.55 : metrics.observedSeconds < 20 ? 0.85 : 1.15;
  score += Math.min(metrics.perclos * perclosWeight, 32);

  if (metrics.observedSeconds >= 25 && !metrics.longEyeClosure && metrics.eyeClosureRatio < 0.45) {
    if (metrics.blinkRate < 5) score += 6;
    else if (metrics.blinkRate < 8) score += 3;
  }
  if (metrics.blinkRate > 35) score += 10;

  if (metrics.microsleepDuration > 3000) score += 34;
  else if (metrics.microsleepDuration > 1800) score += 26;
  else if (metrics.blinkDuration > 900) score += 16;
  else if (metrics.blinkDuration > 500) score += 5;

  if (metrics.yawnDetected) score += 15;

  if (metrics.headPitch > 28) score += 10;
  else if (metrics.headPitch > 18) score += 5;
  if (metrics.headDrop > 24) score += 18;
  else if (metrics.headDrop > 16) score += 10;
  else if (metrics.headDrop > 10) score += 4;
  if (metrics.nodDetected) score += 18;
  if (metrics.gradualHeadDrop) score += 12;
  if (Math.abs(metrics.headRoll) > 15) score += 4;

  if (metrics.eyeClosureRatio > 0.9) score += 26;
  else if (metrics.eyeClosureRatio > 0.75) score += 18;
  else if (metrics.eyeClosureRatio > 0.62) score += 8;

  if (metrics.consecutiveClosed > 120) score += 18;
  else if (metrics.consecutiveClosed > 75) score += 12;
  else if (metrics.consecutiveClosed > 45) score += 6;

  if (metrics.microsleepDuration > 2500 && metrics.eyeClosureRatio > 0.8) score += 14;
  if (metrics.gazeDown && metrics.eyeClosureRatio > 0.55) score += 8;

  const looksAwake =
    metrics.observedSeconds >= 3 &&
    metrics.eyeClosureRatio < 0.35 &&
    metrics.perclos < 12 &&
    metrics.microsleepDuration < 500 &&
    metrics.headDrop < 8 &&
    !metrics.nodDetected &&
    !metrics.gradualHeadDrop;

  if (looksAwake) score *= 0.35;

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
