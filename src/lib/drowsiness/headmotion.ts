export type HeadMotionState = {
  baselinePitch: number;
  headDrop: number;
  velocity: number;
  nodDetected: boolean;
  gradualDrop: boolean;
};

type Sample = {
  pitch: number;
  at: number;
};

export class HeadMotionTracker {
  private baselinePitch = 0;
  private baselineSamples: number[] = [];
  private samples: Sample[] = [];
  private smoothedPitch = 0;

  update(pitch: number, now = Date.now()): HeadMotionState {
    this.smoothedPitch = this.samples.length === 0 ? pitch : this.smoothedPitch * 0.72 + pitch * 0.28;
    this.updateBaseline(this.smoothedPitch);
    this.samples.push({ pitch: this.smoothedPitch, at: now });
    const cutoff = now - 5000;
    this.samples = this.samples.filter((sample) => sample.at >= cutoff);

    const recentFloor = Math.min(...this.samples.map((sample) => sample.pitch), this.baselinePitch);
    const headDrop = Math.max(this.smoothedPitch - this.baselinePitch, this.smoothedPitch - recentFloor);
    const recent = this.findSampleSince(now - 550);
    const older = this.findSampleSince(now - 2800);
    const velocity = recent ? (this.smoothedPitch - recent.pitch) / Math.max(0.1, (now - recent.at) / 1000) : 0;
    const gradualVelocity = older ? (this.smoothedPitch - older.pitch) / Math.max(0.1, (now - older.at) / 1000) : 0;

    return {
      baselinePitch: this.baselinePitch,
      headDrop,
      velocity,
      nodDetected: headDrop > 8 && velocity > 13,
      gradualDrop: headDrop > 10 && gradualVelocity > 2.2,
    };
  }

  reset() {
    this.baselinePitch = 0;
    this.baselineSamples = [];
    this.samples = [];
    this.smoothedPitch = 0;
  }

  private updateBaseline(pitch: number) {
    if (!Number.isFinite(pitch) || Math.abs(pitch) > 45) return;
    if (this.baselineSamples.length < 90) {
      this.baselineSamples.push(pitch);
      this.baselinePitch = average(this.baselineSamples);
      return;
    }

    const headDrop = pitch - this.baselinePitch;
    if (Math.abs(headDrop) < 6) {
      this.baselinePitch = this.baselinePitch * 0.996 + pitch * 0.004;
    }
  }

  private findSampleSince(at: number) {
    return this.samples.find((sample) => sample.at >= at);
  }
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}
