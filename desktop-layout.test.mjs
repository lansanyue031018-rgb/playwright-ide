import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
const app = await readFile(new URL("./app.js", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("./package.json", import.meta.url), "utf8"));

test("run log is promoted into the workflow panel instead of the hidden bottom output panel", () => {
  const flowPanel = html.match(/<section class="panel flow-panel">[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.match(flowPanel, /id="runLogPanel"/);
  assert.match(flowPanel, /id="runOutput"/);
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
