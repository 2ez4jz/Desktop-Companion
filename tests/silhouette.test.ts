import { test } from "node:test";
import assert from "node:assert/strict";
import { hull, contains, packMask } from "../src/interactions/silhouette";
test("projected silhouette includes visible interior and excludes transparent corners", () => {
  const p = hull([
    { x: 0, y: 10 },
    { x: 5, y: 0 },
    { x: 10, y: 10 },
    { x: 5, y: 7 },
    { x: NaN, y: 0 },
  ]);
  assert.equal(contains(p, { x: 5, y: 5 }), true);
  assert.equal(contains(p, { x: 0, y: 0 }), false);
  assert.equal(contains([], { x: 0, y: 0 }), false);
});
test("packed mask preserves every interactive cell with eight times fewer entries", () => {
  const mask = Array.from({ length: 16384 }, (_, i) => (i % 7 === 0 ? 1 : 0)),
    packed = packMask(mask);
  assert.equal(packed.length, 2048);
  for (let i = 0; i < mask.length; i++)
    assert.equal((packed[i >> 3] >> (i & 7)) & 1, mask[i]);
});
