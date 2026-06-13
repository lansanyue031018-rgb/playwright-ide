import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
const app = await readFile(new URL("./app.js", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("./package.json", import.meta.url), "utf8"));

test("run log replaces the inspector empty box instead of staying under the workflow script area", () => {
  const inspectorPanel = html.match(/<aside class="panel inspector-panel">[\s\S]*?<\/aside>/)?.[0] ?? "";
  const flowPanel = html.match(/<section class="panel flow-panel">[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.match(inspectorPanel, /id="runLogPanel"/);
  assert.match(inspectorPanel, /id="runOutput"/);
  assert.match(inspectorPanel, /class="empty-state compact inspector-empty-hint"/);
  assert.doesNotMatch(flowPanel, /id="runLogPanel"/);
  assert.doesNotMatch(html, /<section class="panel output-panel">/);
  assert.doesNotMatch(app, /elements\.flowEmpty\.hidden/);
});

test("project declares an Electron desktop entry and Windows build scripts", () => {
  assert.equal(pkg.main, "electron/main.cjs");
  assert.equal(pkg.scripts["desktop:dev"], "electron electron/main.cjs");
  assert.equal(pkg.scripts["desktop:pack"], "electron-builder --win --dir");
  assert.ok(pkg.devDependencies?.electron);
  assert.ok(pkg.devDependencies?.["electron-builder"]);
  assert.equal(pkg.build?.win?.target?.[0], "portable");
  assert.match(JSON.stringify(pkg.build), /electron\/main\.cjs/);
});
