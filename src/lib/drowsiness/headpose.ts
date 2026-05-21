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
  const mouthMidY = (leftMouth.y + rightMouth.y) / 2;
  const faceHeight = Math.max(0.001, chin.y - eyeMidY);
  const noseEyeRatio = (nose.y - eyeMidY) / faceHeight;
  const noseMouthRatio = (mouthMidY - nose.y) / faceHeight;
  const chinNoseRatio = (chin.y - nose.y) / faceHeight;
  const pitchFromNose = (noseEyeRatio - 0.38) * 92;
  const pitchFromMouth = (0.36 - noseMouthRatio) * 72;
  const pitchFromChin = (0.58 - chinNoseRatio) * 46;
  const pitch = pitchFromNose * 0.55 + pitchFromMouth * 0.3 + pitchFromChin * 0.15;
  const roll = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * (180 / Math.PI);

  return { pitch, roll };
}
