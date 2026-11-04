import type { Point } from "../physics/world";
/** Requires moving strokes in both directions; hover and straight travel cannot pet. */
export class StrokeDetector {
  private last: Point | null = null;
  private sign = 0;
  private distance = 0;
  private turns = 0;
  private elapsed = 0;
  private outside = 0;
  private stationary = 0;
  reset() {
    this.last = null;
    this.sign = 0;
    this.distance = 0;
    this.turns = 0;
    this.elapsed = 0;
    this.outside = 0;
    this.stationary = 0;
  }
  sample(p: Point, head: boolean, dt: number, size: number) {
    if (!head) {
      this.outside += dt;
      if (this.outside > 0.22) this.reset();
      return false;
    }
    this.outside = 0;
    this.elapsed += dt;
    if (this.last) {
      const dx = p.x - this.last.x,
        dy = p.y - this.last.y,
        delta = Math.hypot(dx, dy);
      if (delta > size * 0.65) {
        this.reset();
        this.last = p;
        return false;
      }
      if (delta > size * 0.005) this.stationary = 0;
      else this.stationary += dt;
      if (Math.abs(dx) > size * 0.012 && Math.abs(dy) < size * 0.22) {
        const s = Math.sign(dx);
        if (this.sign && s !== this.sign && this.distance > size * 0.12) {
          this.turns++;
          this.distance = 0;
        }
        this.sign = s;
        this.distance += Math.abs(dx);
      }
    }
    this.last = p;
    if (this.stationary > 0.25) {
      this.turns = 0;
      this.distance = 0;
      this.sign = 0;
    }
    return this.turns >= 2 && this.elapsed > 0.35 && this.stationary < 0.15;
  }
}
