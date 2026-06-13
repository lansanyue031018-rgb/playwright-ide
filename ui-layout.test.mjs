import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
const app = await readFile(new URL("./app.js", import.meta.url), "utf8");

test("insertion hint lives beside the workflow heading instead of the empty flow box", () => {
  assert.match(html, /id="flowHint"[^>]*>从左侧插入操作。选中条件分支后，新操作会作为缩进子步骤插入。/);
  assert.doesNotMatch(html, /<div id="flowEmpty"[^>]*>\s*从左侧插入操作。选中条件分支后，新操作会作为缩进子步骤插入。\s*<\/div>/);
});

test("step inspector exposes a parameter interface editor", () => {
  assert.match(app, /function createParameterInterfaceEditor/);
  assert.match(app, /setAttribute\("data-parameter-action", "add"\)/);
  assert.match(app, /data-parameter-field="options"/);
  assert.match(app, /function updateParameterInterface/);
});
