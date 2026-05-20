import type { Landmark } from "./types";

export function estimateHeadPose(landmarks: Landmark[]) {
  const nose = landmarks[1];
  const chin = landmarks[152];
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  const leftMouth = landmarks[61];
  const rightMouth = landmarks[291];

  if (!nose || !chin || !leftEye || !rightEye || !leftMouth || !rightMouth) {
    return { pitch: 0, roll: 0 };
  }

  const eyeMidY = (leftEye.y + rightEye.y) / 2;
  const faceHeight = Math.max(0.001, chin.y - eyeMidY);
  const noseRatio = (nose.y - eyeMidY) / faceHeight;
  const pitch = (noseRatio - 0.42) * 70;
  const roll = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * (180 / Math.PI);

  return { pitch, roll };
}
