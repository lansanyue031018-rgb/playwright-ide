import assert from "node:assert/strict";
import test from "node:test";

import {
  STEP_DEFINITIONS,
  createStep,
  createViduTemplate,
  generateMjs
} from "./generator.js";
import { normalizeSteps, parseMjs } from "./parser.js";

test("wait step generates a concrete waitForTimeout call", () => {
  const code = generateMjs([
    createStep("wait", { milliseconds: 2500 })
  ]);

  assert.match(code, /await page\.waitForTimeout\(2500\);/);
});

test("random wait generates an inclusive value between minimum and maximum", () => {
  const code = generateMjs([
    createStep("wait", {
      waitMode: "random",
      minMilliseconds: 800,
      maxMilliseconds: 1600
    })
  ]);

  assert.match(
    code,
    /await page\.waitForTimeout\(Math\.floor\(Math\.random\(\) \* \(1600 - 800 \+ 1\)\) \+ 800\);/
  );
});

test("random wait can be imported heuristically", () => {
  const source = `
await page.waitForTimeout(
  Math.floor(Math.random() * (2500 - 1200 + 1)) + 1200
);
`;

  const result = parseMjs(source);

  assert.equal(result.steps[0].type, "wait");
  assert.equal(result.steps[0].values.waitMode, "random");
  assert.equal(result.steps[0].values.minMilliseconds, 1200);
  assert.equal(result.steps[0].values.maxMilliseconds, 2500);
});

test("disabled steps are omitted", () => {
  const disabled = createStep("elementAction", {
    action: "fill",
    locatorType: "css",
    target: "#name",
    value: "hidden"
  });
  disabled.enabled = false;

  const code = generateMjs([disabled]);
  assert.doesNotMatch(code, /#name/);
});

test("Vidu template includes CDP, upload and prompt steps", () => {
  const code = generateMjs(createViduTemplate());

  assert.match(code, /connectOverCDP/);
  assert.match(code, /setInputFiles/);
  assert.match(code, /prompt-text-editor/);
});

test("browser nodes use a port-specific Edge profile by default", () => {
  const step = createStep("connect", {
    endpoint: "http://127.0.0.1:9223"
  });
  const code = generateMjs([step]);

  assert.equal(step.values.userDataDir, "%TEMP%\\vidu-edge-profile-{port}");
  assert.match(code, /vidu-edge-profile-\{port\}/);
  assert.match(code, /replaceAll\("\{port\}", port\)/);
});

test("generated MJS can be imported without losing workflow values", () => {
  const original = [
    createStep("wait", { milliseconds: 2500 }),
    createStep("elementAction", {
      action: "fill",
      locatorType: "css",
      target: "#prompt",
      value: "雨夜霓虹"
    })
  ];

  const result = parseMjs(generateMjs(original));

  assert.equal(result.mode, "metadata");
  assert.equal(result.steps.length, 2);
  assert.equal(result.steps[0].values.milliseconds, 2500);
  assert.equal(result.steps[1].values.value, "雨夜霓虹");
});

test("legacy generated MJS is recognized heuristically", () => {
  const source = `
import { chromium } from "playwright";

//==================== 固定等待 ====================

await page.waitForTimeout(1800);

//==================== 填写内容 ====================

await page.locator("#name").fill("白发女性");
`;

  const result = parseMjs(source);

  assert.equal(result.mode, "heuristic");
  assert.equal(result.recognized, 2);
  assert.equal(result.steps[0].type, "wait");
  assert.equal(result.steps[1].type, "elementAction");
  assert.equal(result.steps[1].values.action, "fill");
});

test("unknown handwritten MJS is preserved as custom code", () => {
  const result = parseMjs('doSomethingUnknown("handwritten");');

  assert.equal(result.mode, "fallback");
  assert.equal(result.steps[0].type, "custom");
  assert.match(result.steps[0].values.code, /handwritten/);
});

test("legacy locator sections become concrete element and message operations", () => {
  const source = `
import { chromium } from "playwright";

//==================== 查找主体按钮 ====================

const button = page.getByRole("button", {
  name: "主体",
  exact: true
});

await button.click();
console.log("已点击主体按钮");
`;

  const result = parseMjs(source);

  assert.deepEqual(result.steps.map(step => step.type), [
    "elementAction",
    "elementAction",
    "messageAction"
  ]);
  assert.equal(result.steps[0].values.action, "locate");
  assert.equal(result.steps[0].values.resultVariable, "button");
  assert.equal(result.steps[1].values.action, "click");
  assert.equal(result.steps[1].values.locatorType, "existing");
  assert.equal(result.custom, 0);
});

test("file existence is represented by a condition with nested actions", () => {
  const step = createStep("condition", {
    conditionType: "file",
    operand: "config.file",
    operator: "notExists"
  });
  step.children.push(createStep("messageAction", {
    action: "throw",
    valueMode: "template",
    message: "文件不存在：${config.file}"
  }));

  const code = generateMjs([step]);

  assert.match(code, /import fs from "node:fs"/);
  assert.match(code, /if \(!fs\.existsSync\(config\.file\)\) \{/);
  assert.match(code, /throw new Error\(`文件不存在：\$\{config\.file\}`\);/);
  assert.doesNotMatch(code, /fileCheck/);
});

test("file conditions do not duplicate an imported fs declaration", () => {
  const code = generateMjs([
    createStep("templateCode", {
      title: "脚本初始化",
      category: "初始化",
      template: 'import fs from "node:fs";',
      parameters: []
    }),
    createStep("condition", {
      conditionType: "file",
      operand: "config.file",
      operator: "exists"
    })
  ]);

  assert.equal((code.match(/import fs from "node:fs"/g) || []).length, 1);
});

test("advanced code overrides a structured condition only when enabled", () => {
  const step = createStep("condition", {
    conditionType: "variable",
    operand: "config.enabled",
    operator: "truthy"
  });
  step.values.advancedCode = "console.log(config.enabled);";
  step.values.advancedEnabled = true;

  const code = generateMjs([step]);
  assert.match(code, /console\.log\(config\.enabled\)/);
  assert.doesNotMatch(code, /if \(config\.enabled\)/);
});

test("condition supports an else branch and nested element actions", () => {
  const condition = createStep("condition", {
    conditionType: "variable",
    operand: "uploadedName",
    operator: "truthy",
    elseEnabled: true
  });
  condition.children.push(createStep("elementAction", {
    action: "click",
    locatorType: "existing",
    target: "confirmButton"
  }));
  condition.elseChildren.push(createStep("messageAction", {
    action: "log",
    valueMode: "text",
    message: "未选择文件"
  }));

  const code = generateMjs([condition]);

  assert.match(code, /if \(uploadedName\) \{/);
  assert.match(code, /  await confirmButton\.click/);
  assert.match(code, /\} else \{/);
  assert.match(code, /  console\.log\("未选择文件"\);/);
});

test("legacy file checks migrate to structured conditions", () => {
  const steps = normalizeSteps([
    {
      id: "legacy-file-check",
      type: "fileCheck",
      enabled: true,
      values: {
        pathExpression: "config.file",
        errorMessage: "文件不存在：${config.file}"
      }
    }
  ]);

  assert.equal(steps[0].type, "condition");
  assert.equal(steps[0].values.conditionType, "file");
  assert.equal(steps[0].values.operator, "notExists");
  assert.equal(steps[0].children[0].type, "messageAction");
  assert.equal(steps[0].children[0].values.action, "throw");
});

test("metadata round trip preserves nested condition children", () => {
  const condition = createStep("condition", {
    conditionType: "expression",
    operand: "inputCount < 3",
    operator: "truthy"
  });
  condition.children.push(createStep("messageAction", {
    action: "throw",
    valueMode: "template",
    message: "输入框数量异常：${inputCount}"
  }));

  const result = parseMjs(generateMjs([condition]));

  assert.equal(result.mode, "metadata");
  assert.equal(result.steps[0].type, "condition");
  assert.equal(result.steps[0].children[0].type, "messageAction");
  assert.equal(result.steps[0].children[0].values.message, "输入框数量异常：${inputCount}");
});

test("section comments inside a condition do not hide nested element actions", () => {
  const source = `
//==================== 高级配置 ====================

if (config.enableAdvancedConfig) {
  //==================== 重新填写风格 ====================

  await styleField.fill(config.style);
}
`;

  const result = parseMjs(source);
  const condition = result.steps[0];

  assert.equal(condition.type, "condition");
  assert.equal(condition.children.length, 1);
  assert.equal(condition.children[0].type, "elementAction");
  assert.equal(condition.children[0].values.action, "fill");
});

test("commented optional element actions import as disabled concrete steps", () => {
  const source = `
//==================== 可选：点击创作 ====================

// await page
//   .locator('[data-testid="form-submit-button"]')
//   .click();
`;

  const result = parseMjs(source);

  assert.equal(result.steps[0].type, "elementAction");
  assert.equal(result.steps[0].values.action, "click");
  assert.equal(result.steps[0].enabled, false);
});

test("find-page template logs preserve nested function calls", () => {
  const source = `
//==================== 查找页面 ====================

const pages = browser.contexts().flatMap(context => context.pages());
const page = pages.find(page =>
  page.url().includes("/create/character2video")
);

if (!page) {
  throw new Error("未找到页面");
}

console.log(\`已连接页面：\${page.url()}\`);
`;

  const code = generateMjs(parseMjs(source).steps);

  assert.match(code, /console\.log\(`已连接页面：\$\{page\.url\(\)\}`\);/);
});

test("parameterized code replaces editable placeholders", () => {
  const step = createStep("templateCode", {
    title: "点击按钮",
    category: "定位与操作",
    template: 'await page.getByRole({{param1}}, { name: {{param2}} }).click();',
    parameters: [
      { key: "param1", label: "角色", type: "string", value: "button" },
      { key: "param2", label: "名称", type: "string", value: "主体" }
    ]
  });

  const code = generateMjs([step]);
  assert.match(code, /getByRole\("button", \{ name: "主体" \}\)/);
});

test("element action generates role click from basic parameters", () => {
  const step = createStep("elementAction", {
    action: "click",
    locatorType: "role",
    role: "button",
    target: "主体",
    exact: true,
    timeout: 10000
  });

  const code = generateMjs([step]);
  assert.match(code, /getByRole\("button", \{ name: "主体", exact: true \}\)/);
  assert.match(code, /timeout: 10000/);
});

test("the insertion library exposes condition instead of file check", () => {
  assert.equal(STEP_DEFINITIONS.fileCheck, undefined);
  assert.equal(STEP_DEFINITIONS.condition.library, undefined);
  assert.equal(STEP_DEFINITIONS.condition.label, "条件分支");
});

test("all locator actions can opt into nth selection", () => {
  const code = generateMjs([
    createStep("elementAction", {
      action: "click",
      locatorType: "role",
      role: "button",
      target: "确定",
      nthEnabled: true,
      nthIndex: 2
    })
  ]);

  assert.match(code, /getByRole\("button"[\s\S]*\)\.nth\(2\)\.click/);
});

test("page keyboard supports type and press modes", () => {
  const code = generateMjs([
    createStep("elementAction", {
      action: "keyboard",
      keyboardMode: "type",
      value: "hello",
      valueMode: "text"
    }),
    createStep("elementAction", {
      action: "keyboard",
      keyboardMode: "press",
      value: "Enter",
      valueMode: "text"
    })
  ]);

  assert.match(code, /await page\.keyboard\.type\("hello"\);/);
  assert.match(code, /await page\.keyboard\.press\("Enter"\);/);
});

test("loop nodes generate nested count and for-of loops", () => {
  const countLoop = createStep("loop", {
    loopType: "count",
    indexVariable: "i",
    start: 0,
    endExpression: "3",
    increment: 1
  });
  countLoop.children.push(createStep("wait", { milliseconds: 50 }));

  const forOfLoop = createStep("loop", {
    loopType: "forOf",
    itemVariable: "tag",
    iterableExpression: "config.tags"
  });
  forOfLoop.children.push(createStep("messageAction", {
    action: "log",
    valueMode: "expression",
    message: "tag"
  }));

  const code = generateMjs([countLoop, forOfLoop]);
  assert.match(code, /for \(let i = 0; i < 3; i \+= 1\) \{/);
  assert.match(code, /for \(const tag of config\.tags\) \{/);
});

test("structured tasks generate their child operations as one named block", () => {
  const task = createStep("task", { name: "填写主体", mode: "structured" });
  task.children.push(createStep("wait", { milliseconds: 250 }));

  const code = generateMjs([task]);

  assert.match(code, /任务：填写主体/);
  assert.match(code, /await page\.waitForTimeout\(250\)/);
});

test("task insertion uses an existing task selector instead of a name field", () => {
  const fields = STEP_DEFINITIONS.task.fields;
  const mode = fields.find(field => field.key === "mode");

  assert.equal(fields.some(field => field.key === "name"), false);
  assert.equal(fields.some(field => field.key === "taskId"), true);
  assert.deepEqual(mode.options[0], ["existing", "现有任务"]);
});

test("module tasks generate a dynamic import", () => {
  const code = generateMjs([
    createStep("task", {
      name: "外部任务",
      mode: "module",
      modulePath: "./runtime/tasks/external.mjs"
    })
  ]);

  assert.match(code, /await import\("\.\/runtime\/tasks\/external\.mjs"\);/);
});

test("heuristic import recognizes loops and nth locators", () => {
  const source = `
for (const tag of config.tags) {
  await page.locator(".tag").nth(1).fill(tag);
}
`;

  const result = parseMjs(source);

  assert.equal(result.steps[0].type, "loop");
  assert.equal(result.steps[0].values.loopType, "forOf");
  assert.equal(result.steps[0].children[0].type, "elementAction");
  assert.equal(result.steps[0].children[0].values.nthEnabled, true);
  assert.equal(result.steps[0].children[0].values.nthIndex, 1);
});
