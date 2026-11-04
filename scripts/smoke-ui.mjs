// Real WebGL / pointer regression checks. This is a browser test, not Windows acceptance.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    "1420",
    "--strictPort",
  ],
  { stdio: "pipe" },
);
let serverLog = "";
server.stderr.on("data", (b) => (serverLog += b));
server.stdout.on("data", (b) => (serverLog += b));
let browser;
const results = [];
async function check(name, fn) {
  await fn();
  results.push({ name, passed: true });
  console.log("PASS", name);
}
try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch("http://127.0.0.1:1420")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
    if (i === 49) throw new Error(serverLog);
  }
  browser = await chromium.launch({
    headless: true,
    ...(process.env.SCULPY_CHROMIUM
      ? {
          executablePath: process.env.SCULPY_CHROMIUM,
          args: [
            "--no-sandbox",
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
            "--disable-dev-shm-usage",
          ],
        }
      : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 1380, height: 930 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:1420");
  await page.waitForFunction(() => window.__SCULPY_TEST__?.ready);
  const pose = () =>
    page.evaluate(() => {
      const c = window.__SCULPY_TEST__.companion;
      return {
        ...c.body,
        size: c.settings.size,
        motion: c.motion,
        emotion: c.emotion,
        dragging: c.dragging,
      };
    });
  const stage = await page.locator("#stage").boundingBox();
  const move = async (x, y, steps = 1) =>
    page.mouse.move(stage.x + x, stage.y + y, { steps });
  await check("true 3D GLB loaded and rendered", async () => {
    const info = await page.evaluate(
      () => window.__SCULPY_TEST__.renderer.renderer.info.render,
    );
    assert.ok(info.triangles > 40000);
    assert.ok(info.calls >= 5);
  });
  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/studio.png" });
  await check(
    "visible character is raycastable and empty canvas is not",
    async () => {
      const p = await pose();
      const hits = await page.evaluate(({ x, y, size }) => {
        const r = window.__SCULPY_TEST__.renderer;
        return { face: r.hit(x, y - size * 0.7), empty: r.hit(2, 2) };
      }, p);
      assert.equal(hits.face.hit, true);
      assert.equal(hits.face.head, true);
      assert.equal(hits.empty.hit, false);
    },
  );
  await check(
    "clicks trigger anger through actual pointer events",
    async () => {
      const p = await pose();
      await move(p.x, p.y - p.size * 0.7);
      for (let i = 0; i < 6; i++) {
        await page.mouse.click(stage.x + p.x, stage.y + p.y - p.size * 0.7);
        await page.waitForTimeout(70);
      }
      assert.equal((await pose()).emotion, "Angry");
    },
  );
  await page.locator("#reset-scene").click();
  await check("mouse strokes trigger happy emotion", async () => {
    const p = await pose();
    for (let j = 0; j < 10; j++) {
      await move(p.x - 45, p.y - p.size * 0.72, 8);
      await page.waitForTimeout(50);
      await move(p.x + 45, p.y - p.size * 0.72, 8);
      await page.waitForTimeout(50);
    }
    assert.equal((await pose()).emotion, "Happy");
  });
  await page.locator("#reset-scene").click();
  await check("grab / drag / release settles on floor", async () => {
    const p = await pose();
    await move(p.x, p.y - p.size * 0.28);
    await page.mouse.down();
    await move(p.x - 120, p.y - p.size * 0.28 - 150, 20);
    await page.waitForTimeout(100);
    assert.equal((await pose()).dragging, true);
    await page.mouse.up();
    await page.waitForTimeout(3400);
    const q = await pose();
    assert.equal(q.dragging, false);
    assert.ok(Math.abs(q.y - p.y) < 1);
    assert.equal(q.grounded, true);
  });
  await check("sleeping character wakes when clicked", async () => {
    await page.locator('[data-motion="Sleep"]').click();
    await page.waitForTimeout(400);
    assert.equal((await pose()).motion, "Sleep");
    const p = await pose();
    await page.mouse.click(stage.x + p.x, stage.y + p.y - p.size * 0.62);
    await page.waitForTimeout(50);
    assert.equal((await pose()).motion, "WakeUp");
  });
  await check("settings persist after reload", async () => {
    await page.locator("#settings-toggle").click();
    await page.locator("#sound").check();
    await page.locator("#size").fill("280");
    await page.locator("#size").dispatchEvent("change");
    await page.locator("#settings-close").click();
    await page.reload();
    await page.waitForFunction(() => window.__SCULPY_TEST__?.ready);
    const s = await page.evaluate(
      () => window.__SCULPY_TEST__.companion.settings,
    );
    assert.equal(s.size, 280);
    assert.equal(s.sound, true);
  });
  await check(
    "alpha silhouette excludes background and includes character",
    async () => {
      const mask = await page.evaluate(() =>
        window.__SCULPY_TEST__.renderer.mask(),
      );
      const opaque = mask.reduce((a, b) => a + b, 0);
      assert.equal(mask.length, 16384);
      assert.ok(opaque > 100 && opaque < 5000);
      assert.equal(mask[0], 0);
    },
  );
  await check("360 degree preview keeps the model rendered", async () => {
    await page.locator("#rotation").fill("180");
    await page.locator("#rotation").dispatchEvent("input");
    await page.waitForTimeout(100);
    await page.screenshot({ path: "test-results/back.png" });
    const info = await page.evaluate(
      () => window.__SCULPY_TEST__.renderer.renderer.info.render,
    );
    assert.ok(info.triangles > 40000);
  });
  await check("small viewport remains usable", async () => {
    await page.setViewportSize({ width: 430, height: 932 });
    await page.waitForTimeout(150);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    assert.equal(overflow, false);
    await page.screenshot({ path: "test-results/narrow.png" });
  });
  assert.deepEqual(errors, []);
  await writeFile(
    "test-results/ui-results.json",
    JSON.stringify({ passed: results.length, results, errors }, null, 2),
  );
} finally {
  await browser?.close();
  server.kill();
}
