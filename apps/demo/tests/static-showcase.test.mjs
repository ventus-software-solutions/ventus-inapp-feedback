import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { extname, resolve } from "node:path";
import test from "node:test";

const output = resolve(import.meta.dirname, "../dist-showcase");

async function readOutputFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const texts = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) texts.push(...(await readOutputFiles(path)));
    else if ([".html", ".js", ".css"].includes(extname(entry.name))) {
      texts.push(await readFile(path, "utf8"));
    }
  }
  return texts;
}

test("builds a backend-free public showcase", async () => {
  const html = await readFile(resolve(output, "index.html"), "utf8");
  const bundle = (await readOutputFiles(output)).join("\n");

  assert.match(html, /Interactive Simulation/);
  assert.match(html, /property="og:image"/);
  assert.match(html, /connect-src 'none'/);
  assert.match(bundle, /Interactive simulation/);
  assert.match(bundle, /Nothing is uploaded or saved/);
  assert.match(bundle, /search_feedback/);
  assert.match(bundle, /close_feedback/);
  assert.doesNotMatch(bundle, /demo-service-token|demo-browser-key/);
  assert.doesNotMatch(bundle, /localhost:8180/);
});
