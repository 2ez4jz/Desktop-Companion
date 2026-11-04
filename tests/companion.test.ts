import { test } from "node:test";
import assert from "node:assert/strict";
import { Companion } from "../src/behaviors/companion";
import { StrokeDetector } from "../src/interactions/strokes";
import {
  integrate,
  nearestArea,
  safePosition,
  type Body,
} from "../src/physics/world";
import { sanitizeSettings } from "../src/settings/schema";
const area = { x: 0, y: 0, width: 1920, height: 1040, scale: 1 };
const make = () => {
  const c = new Companion(() => 0.1);
  c.setDisplays([area]);
  c.reset();
  return c;
};
const advance = (c: Companion, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) c.update(1 / 60);
};

test("hover and a single pass do not count as petting", () => {
  const s = new StrokeDetector();
  for (let i = 0; i < 120; i++)
    assert.equal(s.sample({ x: 100, y: 100 }, true, 1 / 60, 240), false);
  s.reset();
  for (let i = 0; i < 40; i++)
    assert.equal(s.sample({ x: i * 5, y: 100 }, true, 1 / 60, 240), false);
});
test("repeated back and forth strokes trigger petting then stop on hover", () => {
  const s = new StrokeDetector();
  let triggered = false;
  for (let i = 0; i < 100; i++) {
    const x = 100 + Math.sin(i * 0.18) * 60;
    triggered = s.sample({ x, y: 100 }, true, 1 / 60, 240) || triggered;
  }
  assert.equal(triggered, true);
  let result = true;
  for (let i = 0; i < 40; i++)
    result = s.sample({ x: 100, y: 100 }, true, 1 / 60, 240);
  assert.equal(result, false);
});
test("head strokes must stay in the head area", () => {
  const s = new StrokeDetector();
  for (let i = 0; i < 150; i++)
    assert.equal(
      s.sample({ x: 100 + Math.sin(i * 0.2) * 60, y: 500 }, false, 1 / 60, 240),
      false,
    );
});
test("five rapid clicks cause anger and event cooldown prevents spam", () => {
  const c = make();
  const events: string[] = [];
  c.onEvent = (s) => events.push(s);
  for (let i = 0; i < 10; i++) {
    c.pointerDown({ x: 600, y: 600 }, true);
    c.pointerUp();
    c.update(0.02);
  }
  assert.equal(c.emotion, "Angry");
  assert.equal(events.filter((e) => e === "别戳啦").length, 1);
});
test("sleeping companion wakes on click", () => {
  const c = make();
  c.act("Sleep");
  c.pointerDown({ x: 600, y: 700 }, true);
  c.pointerUp();
  assert.equal(c.motion, "WakeUp");
  assert.equal(c.emotion, "Surprised");
  advance(c, 1.2);
  assert.equal(c.motion, "Idle");
});
test("drag -> drop -> hard landing -> fall -> get up converges safely", () => {
  const c = make();
  c.pointerDown({ x: c.body.x, y: c.body.y - 100 }, true);
  c.pointerMove({ x: c.body.x - 100, y: 200 }, false, 1 / 30);
  assert.equal(c.dragging, true);
  assert.equal(String(c.motion), "Held");
  c.body.vy = 0;
  c.body.vx = 0;
  c.pointerUp();
  let fell = false,
    rose = false;
  for (let i = 0; i < 360; i++) {
    c.update(1 / 60);
    fell = fell || c.motion === "Fall";
    rose = rose || c.motion === "GetUp";
  }
  assert.equal(fell, true);
  assert.equal(rose, true);
  assert.equal(c.dragging, false);
  assert.equal(c.body.y, 1040);
  assert.equal(c.body.grounded, true);
});
test("release uses capped throw velocity and bounces", () => {
  const b: Body = { x: 500, y: 700, vx: 99999, vy: 99999, grounded: false };
  let bounce = false;
  for (let i = 0; i < 120; i++) {
    const impact = integrate(b, 1 / 60, area, 240);
    bounce = bounce || !!impact?.bounced;
    assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y));
    assert.ok(b.x >= 100 && b.x <= 1820);
    assert.ok(b.y <= 1040);
  }
  assert.equal(bounce, true);
});
test("pause freezes physics and state timers", () => {
  const c = make();
  c.act("Jump");
  c.settings.paused = true;
  const before = JSON.stringify({
    body: c.body,
    clock: c.clock,
    motion: c.motion,
  });
  advance(c, 10);
  assert.equal(
    JSON.stringify({ body: c.body, clock: c.clock, motion: c.motion }),
    before,
  );
});
test("negative monitor coordinates, display gaps and disconnection stay recoverable", () => {
  const left = { x: -1920, y: -200, width: 1920, height: 1080, scale: 1.5 };
  assert.equal(nearestArea({ x: -800, y: 300 }, [area, left]), left);
  const p = safePosition({ x: -4000, y: -1000 }, left, 360);
  assert.ok(p.x >= left.x && p.y >= left.y + 360);
  const c = make();
  c.setDisplays([left, area]);
  c.body.x = -800;
  c.body.y = 700;
  c.setDisplays([area]);
  assert.ok(c.body.x >= 0);
  c.reset();
  assert.ok(c.body.x < 1920 && c.body.y <= 1040);
});
test("reduced activity stops random motion while long idle permits rest", () => {
  const c = make();
  c.settings.activity = 0;
  advance(c, 50);
  assert.equal(c.motion, "Idle");
  advance(c, 150);
  assert.equal(c.motion, "Sleep");
});
test("untrusted settings stay finite and in supported ranges", () => {
  const s = sanitizeSettings({
    size: Infinity,
    activity: -5,
    paused: "yes" as never,
    sound: true,
  });
  assert.equal(s.size, 240);
  assert.equal(s.activity, 0);
  assert.equal(s.paused, false);
  assert.equal(s.sound, true);
});
test("four simulated hours of autonomous motion remain bounded", () => {
  const c = make();
  for (let i = 0; i < 4 * 3600 * 30; i++) {
    c.update(1 / 30);
    if (i % 900 === 0) {
      c.act("Jump");
    }
    assert.ok(Number.isFinite(c.body.x) && Number.isFinite(c.body.y));
    assert.ok(c.body.x >= 100 && c.body.x <= 1820);
    assert.ok(c.body.y <= 1040);
  }
});
