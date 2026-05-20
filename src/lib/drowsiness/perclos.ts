export class PERCLOSTracker {
  private frames: boolean[] = [];
  private consecutiveClosed = 0;

  constructor(private maxFrames = 900) {}

  update(isClosed: boolean) {
    this.frames.push(isClosed);
    if (this.frames.length > this.maxFrames) this.frames.shift();
    this.consecutiveClosed = isClosed ? this.consecutiveClosed + 1 : 0;
  }

  getPerclos() {
    if (this.frames.length === 0) return 0;
    const closed = this.frames.filter(Boolean).length;
    return (closed / this.frames.length) * 100;
  }

  getConsecutiveClosed() {
    return this.consecutiveClosed;
  }
}

export class BlinkTracker {
  private blinkTimestamps: number[] = [];
  private closedStartedAt = 0;
  private lastDuration = 0;

  update(isClosed: boolean, now = Date.now()) {
    if (isClosed && !this.closedStartedAt) {
      this.closedStartedAt = now;
    }

    if (!isClosed && this.closedStartedAt) {
      this.lastDuration = now - this.closedStartedAt;
      this.closedStartedAt = 0;
      if (this.lastDuration >= 80) this.blinkTimestamps.push(now);
    }

    const cutoff = now - 60_000;
    this.blinkTimestamps = this.blinkTimestamps.filter((timestamp) => timestamp >= cutoff);
  }

  getRate() {
    return this.blinkTimestamps.length;
  }

  getLastDuration() {
    return this.closedStartedAt ? Date.now() - this.closedStartedAt : this.lastDuration;
  }
}
