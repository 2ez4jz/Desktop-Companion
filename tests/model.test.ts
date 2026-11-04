import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
test("shipped GLB contains valid geometry, skin and all promised animation clips", () => {
  const b = readFileSync(
    new URL("../public/models/sculpy.glb", import.meta.url),
  );
  assert.equal(b.toString("utf8", 0, 4), "glTF");
  assert.equal(b.readUInt32LE(4), 2);
  assert.equal(b.readUInt32LE(8), b.length);
  const length = b.readUInt32LE(12);
  const json = JSON.parse(b.toString("utf8", 20, 20 + length));
  assert.ok(json.meshes.length >= 4);
  assert.ok(json.skins.length >= 1);
  assert.equal(json.skins[0].joints.length, 7);
  const names = new Set(json.animations.map((a: { name: string }) => a.name));
  for (const name of [
    "Idle",
    "Blink",
    "Look",
    "HeadTilt",
    "Walk",
    "Jump",
    "Sit",
    "Sleep",
    "WakeUp",
    "Stretch",
    "Fall",
    "GetUp",
    "Happy",
    "Angry",
    "Surprised",
    "Held",
  ])
    assert.ok(names.has(name), name);
  for (const anim of json.animations) assert.ok(anim.channels.length > 0);
  assert.ok(b.length < 3_000_000);
});
