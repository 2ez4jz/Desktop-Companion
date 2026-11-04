export interface Point {
  x: number;
  y: number;
}
export interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}
export const clamp = (v: number, a: number, b: number) =>
  Math.max(a, Math.min(b, v));
export function nearestArea(p: Point, areas: Area[]): Area {
  if (!areas.length) throw new Error("No display work area");
  return areas.reduce((best, a) =>
    distance(p, a) < distance(p, best) ? a : best,
  );
}
function distance(p: Point, a: Area) {
  return Math.hypot(
    p.x - clamp(p.x, a.x, a.x + a.width),
    p.y - clamp(p.y, a.y, a.y + a.height),
  );
}
export function safePosition(p: Point, area: Area, size: number): Point {
  const h = Math.min(size, area.height),
    r = Math.min(h * 0.42, area.width / 2);
  return {
    x: clamp(p.x, area.x + r, area.x + area.width - r),
    y: clamp(p.y, area.y + h, area.y + area.height),
  };
}
export interface Body extends Point {
  vx: number;
  vy: number;
  grounded: boolean;
}
export interface Impact {
  speed: number;
  bounced: boolean;
}
export function integrate(
  body: Body,
  dt: number,
  area: Area,
  size: number,
): Impact | null {
  dt = clamp(dt, 0, 1 / 30);
  const scale = area.scale,
    floor = area.y + area.height;
  body.vx = clamp(body.vx, -1800 * scale, 1800 * scale);
  body.vy = clamp(body.vy + 1900 * scale * dt, -1800 * scale, 2200 * scale);
  body.x += body.vx * dt;
  body.y += body.vy * dt;
  const safe = safePosition(body, area, size);
  if (safe.x !== body.x) {
    body.vx *= -0.25;
    body.x = safe.x;
  }
  if (body.y < safe.y) {
    body.y = safe.y;
    body.vy = Math.max(0, body.vy);
  }
  if (body.y >= floor) {
    const speed = Math.max(0, body.vy);
    body.y = floor;
    if (speed > 250 * scale) {
      body.vy = -speed * 0.23;
      body.grounded = false;
      body.vx *= 0.72;
      return { speed, bounced: true };
    }
    body.vy = 0;
    body.grounded = true;
    body.vx *= Math.exp(-9 * dt);
    return speed > 80 * scale ? { speed, bounced: false } : null;
  }
  body.grounded = false;
  return null;
}
