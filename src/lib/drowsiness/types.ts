export type Landmark = {
  x: number;
  y: number;
  z?: number;
};

export type DrowsinessMetrics = {
  avgEAR: number;
  baselineEAR: number;
  eyeClosureRatio: number;
  mar: number;
  perclos: number;
  blinkRate: number;
  blinkDuration: number;
  yawnDetected: boolean;
  headPitch: number;
  headRoll: number;
  gazeDown: boolean;
  consecutiveClosed: number;
};

export type JdsLevel = "AWAKE" | "DROWSY_LOW" | "DROWSY_MED" | "DROWSY_HIGH" | "ASLEEP";

export type JdsResult = {
  score: number;
  level: JdsLevel;
  color: string;
};
