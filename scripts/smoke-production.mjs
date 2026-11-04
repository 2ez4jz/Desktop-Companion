import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import assert from "node:assert/strict";
// Serve only dist, with no Vite process and no development APIs.
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".glb": "model/gltf-binary",
};
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, "http://localhost").pathname;
    assert.ok(!path.includes(".."));
    const file = path === "/" ? "/index.html" : path;
    const data = await readFile(new URL("../dist" + file, import.meta.url));
    const ext = file.slice(file.lastIndexOf("."));
    res.writeHead(200, {
      "Content-Type": mime[ext] ?? "application/octet-stream",
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.SCULPY_CHROMIUM
      ? {
          executablePath: process.env.SCULPY_CHROMIUM,
          args: [
            "--no-sandbox",
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
          ],
        }
      : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 1380, height: 930 },
  });
  const errors = [],
    requests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => requests.push(r.url()));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.locator("canvas").waitFor();
  await page.locator(".loading").waitFor({ state: "detached" });
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => window.__SCULPY_TEST__), undefined);
  assert.ok(requests.some((r) => r.endsWith("/models/sculpy.glb")));
  assert.ok(!requests.some((r) => r.includes(":1420")));
  await page.locator('[data-motion="Sleep"]').click();
  await page.waitForTimeout(100);
  assert.equal(await page.locator("#motion").textContent(), "Sleep");
  await page.locator('[data-motion="WakeUp"]').click();
  await page.waitForTimeout(100);
  assert.equal(await page.locator("#motion").textContent(), "WakeUp");
  assert.deepEqual(errors, []);
  await page.screenshot({ path: "test-results/production-0.1.1.png" });
  console.log(
    "PASS production dist loads GLB and runs interactions without Vite or port 1420",
  );
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
}
