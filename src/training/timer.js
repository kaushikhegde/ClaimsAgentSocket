class SessionTimer {
  constructor(maxSeconds = 180, onWarning, onExpired) {
    this.maxSeconds = maxSeconds;
    this.onWarning = onWarning;
    this.onExpired = onExpired;
    this.startTime = null;
    this.warningTimer = null;
    this.expiryTimer = null;
  }

  start() {
    this.startTime = Date.now();
    // Warning at 30 seconds before end
    const warningMs = (this.maxSeconds - 30) * 1000;
    const expiryMs = this.maxSeconds * 1000;

    if (warningMs > 0) {
      this.warningTimer = setTimeout(() => {
        if (this.onWarning) this.onWarning(30);
      }, warningMs);
    }

    this.expiryTimer = setTimeout(() => {
      if (this.onExpired) this.onExpired();
    }, expiryMs);
  }

  getElapsedSeconds() {
    if (!this.startTime) return 0;
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  getRemainingSeconds() {
    return Math.max(0, this.maxSeconds - this.getElapsedSeconds());
  }

  stop() {
    if (this.warningTimer) clearTimeout(this.warningTimer);
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    this.warningTimer = null;
    this.expiryTimer = null;
  }
}

module.exports = { SessionTimer };
