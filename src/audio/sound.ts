export class Sounds {
  enabled = false;
  private context: AudioContext | undefined;
  unlock() {
    if (!this.context) this.context = new AudioContext();
    void this.context.resume();
  }
  chirp(angry = false) {
    if (!this.enabled || !this.context) return;
    const c = this.context,
      o = c.createOscillator(),
      g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(angry ? 240 : 620, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(
      angry ? 180 : 880,
      c.currentTime + 0.12,
    );
    g.gain.setValueAtTime(0.035, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.17);
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.18);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }
}
