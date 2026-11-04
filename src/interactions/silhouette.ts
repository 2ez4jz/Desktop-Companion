export interface Pixel {
  x: number;
  y: number;
}
const cross = (o: Pixel, a: Pixel, b: Pixel) =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
export function hull(points: Pixel[]): Pixel[] {
  const p = points
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    .sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const lower: Pixel[] = [],
    upper: Pixel[] = [];
  for (const v of p) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, v) <= 0)
      lower.pop();
    lower.push(v);
  }
  for (const v of p.slice().reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, v) <= 0)
      upper.pop();
    upper.push(v);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
export function contains(poly: Pixel[], p: Pixel): boolean {
  if (poly.length < 3) return false;
  for (let i = 0; i < poly.length; i++)
    if (cross(poly[i], poly[(i + 1) % poly.length], p) < 0) return false;
  return true;
}
export function packMask(mask: number[]): number[] {
  const packed = new Array<number>(2048).fill(0);
  for (let i = 0; i < Math.min(mask.length, 16384); i++)
    if (mask[i]) packed[i >> 3] |= 1 << (i & 7);
  return packed;
}
