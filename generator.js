export const STEP_DEFINITIONS = {
  connect: {
    label: "多开浏览器",
    icon: "CDP",
    description: "检测调试端口，必要时启动 Edge，再连接并查找页面",
    fields: [
      field("endpoint", "CDP 地址", "text", "http://127.0.0.1:9222"),
      field("urlIncludes", "页面 URL 包含", "text", "/create/character2video"),
      field("startUrl", "启动页面", "text", "https://www.vidu.com/zh/create/character2video"),
      field("userDataDir", "浏览器用户目录", "text", "%TEMP%\\vidu-edge-profile"),
      field("edgePath", "Edge 路径（留空自动检测）", "text", ""),
      field("waitTimeout", "等待端口（ms）", "number", 30000)
    ]
  },
  comment: {
    label: "分段注释",
    icon: "//",
    description: "生成清晰的脚本分段注释",
    fields: [field("text", "注释内容", "text", "新的步骤")]
  },
  wait: {
    label: "等待",
    icon: "ms",
    description: "按固定时间或随机区间等待",
    fields: [
      selectField("waitMode", "等待方式", "fixed", [
        ["fixed", "固定等待"],
        ["random", "随机等待"]
      ]),
      field("milliseconds", "等待时间（ms）", "number", 1000, {
        showWhen: { waitMode: ["fixed"] }
      }),
      field("minMilliseconds", "最小等待（ms）", "number", 800, {
        showWhen: { waitMode: ["random"] }
      }),
      field("maxMilliseconds", "最大等待（ms）", "number", 1600, {
        showWhen: { waitMode: ["random"] }
      })
    ]
  },
  elementAction: {
    label: "元素操作",
    icon: "UI",
    description: "定位、点击、等待、填写、上传、读取或截图",
    fields: [
      selectField("action", "执行动作", "click", [
        ["locate", "定位并保存元素"],
        ["click", "点击"],
        ["wait", "等待元素"],
        ["fill", "填写内容"],
        ["upload", "上传文件"],
        ["press", "元素按键"],
        ["keyboard", "页面键盘输入"],
        ["count", "读取元素数量"],
        ["inputValue", "读取输入值"],
        ["isEnabled", "读取是否可用"],
        ["isVisible", "读取是否可见"],
        ["evaluate", "读取自定义值"],
        ["screenshot", "元素截图"]
      ]),
      selectField("locatorType", "定位方式", "css", [
        ["css", "CSS 选择器"],
        ["text", "可见文字"],
        ["role", "语义角色"],
        ["placeholder", "占位文字"],
        ["testid", "Test ID"],
        ["existing", "已有 Locator 变量"],
        ["expression", "Locator 表达式"],
        ["page", "整个页面"]
      ], {
        hideWhen: { action: ["keyboard"] }
      }),
      field("scope", "定位作用域", "text", "page", {
        showWhen: { locatorType: ["css", "text", "role", "placeholder", "testid"] }
      }),
      field("target", "定位内容、变量或表达式", "textarea", "", {
        hideWhen: { locatorType: ["page"], action: ["keyboard"] }
      }),
      selectField("role", "角色", "button", [
        ["button", "button"],
        ["option", "option"],
        ["textbox", "textbox"],
        ["tab", "tab"],
        ["gridcell", "gridcell"]
      ], {
        showWhen: { locatorType: ["role"] }
      }),
      checkboxField("exact", "精确匹配", true, {
        showWhen: { locatorType: ["text", "role", "placeholder"] }
      }),
      selectField("state", "等待状态", "visible", [
        ["visible", "可见"],
        ["hidden", "隐藏"],
        ["attached", "已挂载"],
        ["detached", "已移除"]
      ], {
        showWhen: { action: ["wait"] }
      }),
      field("value", "填写内容或按键", "textarea", "", {
        showWhen: { action: ["fill", "press", "keyboard"] }
      }),
      selectField("valueMode", "内容类型", "expression", [
        ["text", "普通文本"],
        ["expression", "变量或表达式"]
      ], {
        showWhen: { action: ["fill", "press", "keyboard"] }
      }),
      selectField("keyboardMode", "页面键盘方式", "type", [
        ["type", "输入普通文本（type）"],
        ["press", "按下按键（press）"]
      ], {
        showWhen: { action: ["keyboard"] }
      }),
      field("path", "本地文件路径", "text", "config.file", {
        showWhen: { action: ["upload", "screenshot"] }
      }),
      selectField("pathMode", "路径类型", "expression", [
        ["text", "固定路径"],
        ["expression", "变量或表达式"]
      ], {
        showWhen: { action: ["upload", "screenshot"] }
      }),
      checkboxField("nthEnabled", "指定匹配序号（.nth）", false, {
        hideWhen: { action: ["keyboard"], locatorType: ["page"] }
      }),
      field("nthIndex", "匹配序号（从 0 开始）", "number", 0, {
        showWhen: { nthEnabled: ["true"] }
      }),
      field("timeout", "超时（ms）", "number", 30000, {
        showWhen: { action: ["click", "wait"] }
      }),
      field("resultVariable", "保存结果到变量", "text", "", {
        showWhen: {
          action: ["locate", "count", "inputValue", "isEnabled", "isVisible", "evaluate"]
        }
      }),
      field("functionExpression", "读取函数", "textarea", "element => element.textContent", {
        showWhen: { action: ["evaluate"] }
      })
    ]
  },
  condition: {
    label: "条件分支",
    icon: "IF",
    description: "检测文件、变量或表达式，并嵌套执行其他步骤",
    fields: [
      selectField("conditionType", "检测对象", "variable", [
        ["file", "文件"],
        ["variable", "变量"],
        ["expression", "表达式"]
      ]),
      field("operand", "文件、变量或表达式", "textarea", "config.file"),
      selectField("operator", "判断方式", "truthy", [
        ["truthy", "为真 / 存在"],
        ["falsy", "为空 / 为假"],
        ["exists", "文件存在"],
        ["notExists", "文件不存在"]
      ]),
      checkboxField("elseEnabled", "启用“否则”分支", false),
      selectField("insertBranch", "新插入步骤放入", "then", [
        ["then", "条件成立"],
        ["else", "否则"]
      ], {
        showWhen: { elseEnabled: ["true"] }
      })
    ]
  },
  loop: {
    label: "循环",
    icon: "LOOP",
    description: "按次数、数组或条件重复执行嵌套步骤",
    fields: [
      selectField("loopType", "循环方式", "count", [
        ["count", "计数循环"],
        ["forOf", "遍历数组（for...of）"],
        ["while", "条件循环（while）"]
      ]),
      field("indexVariable", "计数变量", "text", "i", {
        showWhen: { loopType: ["count"] }
      }),
      field("start", "起始值", "number", 0, {
        showWhen: { loopType: ["count"] }
      }),
      field("endExpression", "结束值或表达式", "text", "3", {
        showWhen: { loopType: ["count"] }
      }),
      field("increment", "每次增加", "number", 1, {
        showWhen: { loopType: ["count"] }
      }),
      field("itemVariable", "当前项变量", "text", "item", {
        showWhen: { loopType: ["forOf"] }
      }),
      field("iterableExpression", "数组或可迭代表达式", "textarea", "config.items", {
        showWhen: { loopType: ["forOf"] }
      }),
      field("conditionExpression", "继续循环条件", "textarea", "true", {
        showWhen: { loopType: ["while"] }
      })
    ]
  },
  task: {
    label: "任务",
    icon: "TASK",
    description: "插入可复用的结构化步骤组或外部 MJS 模块",
    fields: [
      selectField("mode", "任务类型", "existing", [
        ["existing", "现有任务"],
        ["module", "外部 MJS 模块"],
        ["code", "完整代码块"]
      ]),
      field("taskId", "现有任务", "task-select", "", {
        showWhen: { mode: ["existing"] }
      }),
      field("modulePath", "模块路径", "text", "../tasks/task.mjs", {
        showWhen: { mode: ["module"] }
      }),
      field("code", "任务代码", "textarea", "// 任务代码", {
        showWhen: { mode: ["code"] }
      })
    ]
  },
  messageAction: {
    label: "输出消息",
    icon: "LOG",
    description: "打印日志、警告、错误或抛出异常",
    fields: [
      selectField("action", "消息动作", "log", [
        ["log", "打印日志"],
        ["warn", "打印警告"],
        ["error", "打印错误"],
        ["throw", "抛出异常"]
      ]),
      selectField("valueMode", "消息类型", "text", [
        ["text", "普通文本"],
        ["template", "模板文本"],
        ["expression", "变量或表达式"]
      ]),
      field("message", "消息内容", "textarea", "步骤已完成")
    ]
  },
  assertCount: {
    label: "断言数量",
    icon: "=",
    description: "检查选择器匹配数量",
    fields: [
      field("selector", "CSS 选择器", "text", ""),
      field("count", "期望数量", "number", 1),
      field("message", "失败提示", "text", "元素数量异常")
    ]
  },
  findPage: {
    label: "查找页面",
    icon: "PAGE",
    description: "按 URL 片段从浏览器上下文查找页面",
    fields: [
      field("urlIncludes", "URL 包含", "text", "/create/character2video"),
      field("pageVariable", "页面变量名", "text", "page"),
      field("errorMessage", "找不到时提示", "text", "未找到目标页面")
    ]
  },
  templateCode: {
    label: "高级代码步骤",
    icon: "CODE",
    description: "仅承载无法安全拆分的复合 JavaScript",
    library: false,
    fields: [
      field("title", "步骤标题", "text", "高级代码步骤"),
      field("category", "分类", "text", "通用")
    ]
  },
  custom: {
    label: "自定义代码",
    icon: "{}",
    description: "插入任意 Playwright JavaScript",
    fields: [
      field("code", "JavaScript", "textarea", "// 使用 page、browser 等已有变量")
    ]
  }
};

function field(key, label, type, defaultValue, extra = {}) {
  return { key, label, type, defaultValue, ...extra };
}

function selectField(key, label, defaultValue, options, extra = {}) {
  return { key, label, type: "select", defaultValue, options, ...extra };
}

function checkboxField(key, label, defaultValue, extra = {}) {
  return { key, label, type: "checkbox", defaultValue, ...extra };
}

export function createStep(type, overrides = {}) {
  const definition = STEP_DEFINITIONS[type];
  if (!definition) throw new Error(`未知步骤类型：${type}`);

  const values = Object.fromEntries(
    definition.fields.map(item => [item.key, item.defaultValue])
  );
  const step = {
    id: createId(),
    type,
    enabled: true,
    values: {
      advancedEnabled: false,
      advancedCode: "",
      ...values,
      ...overrides
    }
  };

  if (type === "condition") {
    step.children = [];
    step.elseChildren = [];
  } else if (type === "loop" || type === "task") {
    step.children = [];
  }
  if (type === "task") step.collapsed = true;

  return step;
}

export function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `step-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function generateMjs(steps) {
  const enabledSteps = filterEnabledTree(steps);
  const hasConnect = enabledSteps.some(step => step.type === "connect");
  const hasFileCondition = walkSteps(enabledSteps).some(
    step => step.type === "condition" && step.values.conditionType === "file"
  );
  const hasFsImport = walkSteps(enabledSteps).some(step =>
    step.type === "templateCode" &&
    /from\s+["']node:fs["']|require\(\s*["']node:fs["']\s*\)/.test(
      renderParameterizedTemplate(step.values.template, step.values.parameters)
    )
  );
  const lines = [
    'import { chromium } from "playwright";',
    ...(hasConnect
      ? [
          'import { spawn } from "node:child_process";',
          'import { existsSync } from "node:fs";',
          'import path from "node:path";'
        ]
      : []),
    ...(hasFileCondition && !hasFsImport ? ['import fs from "node:fs";'] : []),
    `// playwright-flow-studio:${encodeWorkflowMetadata(steps)}`,
    "",
    ...(hasConnect ? [...browserBootstrapLines(), ""] : [])
  ];

  if (!hasConnect) {
    lines.push(
      section("连接浏览器"),
      "",
      'const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");',
      "const pages = browser.contexts().flatMap(context => context.pages());",
      "const page = pages[0];",
      "",
      'if (!page) throw new Error("未找到可用页面");',
      ""
    );
  }

  enabledSteps.forEach((step, index) => {
    lines.push(...generateStepLines(step, String(index + 1), 0, true));
    if (lines.at(-1) !== "") lines.push("");
  });

  lines.push(
    section("完成"),
    "",
    'console.log("自动化步骤执行完成");',
    ""
  );

  return lines.join("\n");
}

export function encodeWorkflowMetadata(steps) {
  const bytes = new TextEncoder().encode(JSON.stringify(steps));
  let binary = "";

  for (const byte of bytes) binary += String.fromCharCode(byte);
  if (typeof btoa === "function") return btoa(binary);
  return Buffer.from(bytes).toString("base64");
}

export function generateStep(step, index) {
  return generateStepLines(step, String(index + 1), 0, true);
}

function generateStepLines(step, number, depth, includeSection) {
  const prefix = "  ".repeat(depth);
  const lines = [];

  if (includeSection) {
    lines.push(`${prefix}${section(stepTitle(step, number))}`, "");
  } else {
    lines.push(`${prefix}// 子步骤 ${number}：${stepLabel(step)}`);
  }

  if (
    step.type !== "templateCode" &&
    step.values.advancedEnabled &&
    String(step.values.advancedCode || "").trim()
  ) {
    lines.push(...indentLines(String(step.values.advancedCode).trim().split("\n"), depth));
    return lines;
  }

  if (step.type === "condition") {
    lines.push(...generateCondition(step, number, depth));
    return lines;
  }
  if (step.type === "loop") {
    lines.push(...generateLoop(step, number, depth));
    return lines;
  }
  if (
    step.type === "task" &&
    ["existing", "structured"].includes(step.values.mode) &&
    step.values.savedMode !== "module"
  ) {
    lines.push(...generateTask(step, number, depth));
    return lines;
  }

  lines.push(...indentLines(generateStepBody(step, number), depth));
  return lines;
}

function generateStepBody(step, number) {
  const v = step.values;

  switch (step.type) {
    case "connect":
      const ensureLine = `await ensureCdpBrowser({ endpoint: ${quote(v.endpoint)}, startUrl: ${quote(v.startUrl)}, userDataDir: ${quote(v.userDataDir)}, edgePath: ${quote(v.edgePath)}, timeout: ${safeNumber(v.waitTimeout, 30000)} });`;
      if (!String(v.urlIncludes || "").trim()) {
        return [
          ensureLine,
          `const browser = await chromium.connectOverCDP(${quote(v.endpoint)});`
        ];
      }
      return [
        ensureLine,
        `const browser = await chromium.connectOverCDP(${quote(v.endpoint)});`,
        "const pages = browser.contexts().flatMap(context => context.pages());",
        `const page = pages.find(page => page.url().includes(${quote(v.urlIncludes)}));`,
        "",
        `if (!page) throw new Error(${quote(`未找到 URL 包含 ${v.urlIncludes} 的页面`)});`,
        'console.log(`已连接页面：${page.url()}`);'
      ];
    case "comment":
      return [section(v.text || `步骤 ${number}`)];
    case "wait":
      if (v.waitMode === "random") {
        const [minimum, maximum] = normalizedWaitRange(
          v.minMilliseconds,
          v.maxMilliseconds
        );
        return [
          `await page.waitForTimeout(Math.floor(Math.random() * (${maximum} - ${minimum} + 1)) + ${minimum});`
        ];
      }
      return [`await page.waitForTimeout(${safeInteger(v.milliseconds, 1000)});`];
    case "elementAction":
      return generateElementAction(v);
    case "messageAction":
      return [generateMessageAction(v)];
    case "assertCount":
      return [
        `const count${number.replaceAll(".", "_")} = await page.locator(${quote(v.selector)}).count();`,
        `if (count${number.replaceAll(".", "_")} !== ${safeNumber(v.count, 1)}) {`,
        `  throw new Error(${quote(v.message)} + \`：实际为 \${count${number.replaceAll(".", "_")}}\`);`,
        "}"
      ];
    case "findPage": {
      const variable = safeIdentifier(v.pageVariable, "page");
      return [
        "const pages = browser.contexts().flatMap(context => context.pages());",
        `const ${variable} = pages.find(page =>`,
        `  page.url().includes(${quote(v.urlIncludes)})`,
        ");",
        "",
        `if (!${variable}) {`,
        `  throw new Error(${quote(v.errorMessage)});`,
        "}"
      ];
    }
    case "task":
      if (v.mode === "existing" && v.savedMode === "module") {
        return [`await import(${quote(v.modulePath)});`];
      }
      if (v.mode === "module") {
        return [`await import(${quote(v.modulePath)});`];
      }
      return String(v.code || "").split("\n");
    case "templateCode":
      return renderParameterizedTemplate(v.template, v.parameters).split("\n");
    case "custom":
      return String(v.code || "").split("\n");
    default:
      return [`// 未支持的步骤类型：${step.type}`];
  }
}

function generateCondition(step, number, depth) {
  const prefix = "  ".repeat(depth);
  const childDepth = depth + 1;
  const lines = [`${prefix}if (${buildConditionExpression(step.values)}) {`];
  const children = (step.children || []).filter(child => child.enabled !== false);

  if (!children.length) {
    lines.push(`${"  ".repeat(childDepth)}// 条件成立时执行`);
  } else {
    children.forEach((child, index) => {
      lines.push(...generateStepLines(child, `${number}.${index + 1}`, childDepth, false));
    });
  }

  const elseChildren = (step.elseChildren || []).filter(child => child.enabled !== false);
  if (step.values.elseEnabled || elseChildren.length) {
    lines.push(`${prefix}} else {`);
    if (!elseChildren.length) {
      lines.push(`${"  ".repeat(childDepth)}// 条件不成立时执行`);
    } else {
      elseChildren.forEach((child, index) => {
        lines.push(...generateStepLines(
          child,
          `${number}.${children.length + index + 1}`,
          childDepth,
          false
        ));
      });
    }
  }

  lines.push(`${prefix}}`);
  return lines;
}

function generateLoop(step, number, depth) {
  const prefix = "  ".repeat(depth);
  const childDepth = depth + 1;
  const v = step.values;
  let opening;

  if (v.loopType === "forOf") {
    opening = `for (const ${safeIdentifier(v.itemVariable, "item")} of ${rawExpression(v.iterableExpression, "[]")}) {`;
  } else if (v.loopType === "while") {
    opening = `while (${rawExpression(v.conditionExpression, "false")}) {`;
  } else {
    const index = safeIdentifier(v.indexVariable, "i");
    opening = `for (let ${index} = ${safeNumber(v.start, 0)}; ${index} < ${rawExpression(v.endExpression, "0")}; ${index} += ${safeNumber(v.increment, 1)}) {`;
  }

  const lines = [`${prefix}${opening}`];
  const children = (step.children || []).filter(child => child.enabled !== false);
  if (!children.length) {
    lines.push(`${"  ".repeat(childDepth)}// 循环体`);
  } else {
    children.forEach((child, index) => {
      lines.push(...generateStepLines(child, `${number}.${index + 1}`, childDepth, false));
    });
  }
  lines.push(`${prefix}}`);
  return lines;
}

function generateTask(step, number, depth) {
  const prefix = "  ".repeat(depth);
  const childDepth = depth + 1;
  const lines = [
    `${prefix}// 任务：${String(step.values.name || "未命名任务").replaceAll("\n", " ")}`,
    `${prefix}{`
  ];
  const children = (step.children || []).filter(child => child.enabled !== false);
  if (!children.length) {
    lines.push(`${"  ".repeat(childDepth)}// 空任务`);
  } else {
    children.forEach((child, index) => {
      lines.push(...generateStepLines(child, `${number}.${index + 1}`, childDepth, false));
    });
  }
  lines.push(`${prefix}}`);
  return lines;
}

function buildConditionExpression(values) {
  const operand = rawExpression(values.operand, "value");

  if (values.conditionType === "file") {
    const expression = `fs.existsSync(${operand})`;
    return values.operator === "notExists" || values.operator === "falsy"
      ? `!${expression}`
      : expression;
  }

  if (values.conditionType === "expression") {
    return values.operator === "falsy" || values.operator === "notExists"
      ? `!(${operand})`
      : operand;
  }

  return values.operator === "falsy" || values.operator === "notExists"
    ? `!${operand}`
    : operand;
}

function generateMessageAction(values) {
  const expression = messageExpression(values);
  if (values.action === "throw") return `throw new Error(${expression});`;
  const method = ["warn", "error"].includes(values.action) ? values.action : "log";
  return `console.${method}(${expression});`;
}

function messageExpression(values) {
  if (values.valueMode === "expression") {
    return rawExpression(values.message, '""');
  }
  if (values.valueMode === "template") {
    return `\`${escapeTemplateLiteral(values.message)}\``;
  }
  return quote(values.message);
}

export function summarizeStep(step) {
  const v = step.values;

  switch (step.type) {
    case "connect": return `${v.endpoint} -> ${v.urlIncludes}`;
    case "comment": return v.text;
    case "wait":
      return v.waitMode === "random"
        ? `${normalizedWaitRange(v.minMilliseconds, v.maxMilliseconds).join(" - ")} ms 随机`
        : `${v.milliseconds} ms 固定`;
    case "elementAction":
      return `${elementActionLabel(v.action)}：${v.resultVariable || v.target || "page"}`;
    case "condition":
      return `${conditionTypeLabel(v.conditionType)} ${v.operator} ${v.operand}`;
    case "loop":
      return v.loopType === "forOf"
        ? `${v.itemVariable} of ${v.iterableExpression}`
        : v.loopType === "while"
          ? `while ${v.conditionExpression}`
          : `${v.indexVariable}: ${v.start} -> ${v.endExpression}`;
    case "task":
      if (v.mode === "existing") {
        return v.name
          ? `${v.name}（${v.savedMode === "module" ? "MJS 模块" : "现有任务"}）`
          : "请选择现有任务";
      }
      return `${v.name || v.modulePath || "未命名任务"}（${v.mode}）`;
    case "messageAction":
      return `${v.action}：${shorten(v.message)}`;
    case "assertCount": return `${v.selector} === ${v.count}`;
    case "findPage": return `${v.pageVariable} -> ${v.urlIncludes}`;
    case "templateCode": return `${v.category}：${summarizeParameters(v.parameters)}`;
    case "custom": return shorten(v.code);
    default: return step.type;
  }
}

export function getAdvancedCode(step) {
  if (step.type === "templateCode") return String(step.values.template || "");
  if (step.values.advancedCode) return String(step.values.advancedCode);

  const clone = {
    ...step,
    values: {
      ...step.values,
      advancedEnabled: false,
      advancedCode: ""
    }
  };

  if (clone.type === "condition") {
    return generateCondition(clone, "1", 0).join("\n").trim();
  }
  if (clone.type === "loop") {
    return generateLoop(clone, "1", 0).join("\n").trim();
  }
  if (
    clone.type === "task" &&
    ["existing", "structured"].includes(clone.values.mode) &&
    clone.values.savedMode !== "module"
  ) {
    return generateTask(clone, "1", 0).join("\n").trim();
  }

  return generateStepBody(clone, "1").join("\n").trim();
}

export function createViduTemplate() {
  return [
    createStep("connect"),
    createStep("elementAction", {
      action: "click",
      locatorType: "role",
      role: "button",
      target: "主体",
      exact: true
    }),
    createStep("elementAction", {
      action: "wait",
      locatorType: "css",
      target: 'input[placeholder*="搜索主体名称"]',
      state: "visible",
      timeout: 30000
    }),
    createStep("elementAction", {
      action: "upload",
      locatorType: "expression",
      target: 'page.locator(\'[role="dialog"]:has-text("创建主体") input[type="file"][accept*="image"]\')',
      nthEnabled: true,
      nthIndex: 0,
      path: "D:\\images\\1.jpg",
      pathMode: "text"
    }),
    createStep("wait", { milliseconds: 2000 }),
    createStep("elementAction", {
      action: "fill",
      locatorType: "css",
      target: '[data-testid="prompt-text-editor"]',
      value: "主体走在雨夜的霓虹街道上，电影级运镜",
      valueMode: "text"
    })
  ];
}

function generateElementAction(values) {
  if (values.action === "keyboard" || values.action === "keyboardType") {
    const method = values.action === "keyboardType" || values.keyboardMode !== "press"
      ? "type"
      : "press";
    return [`await page.keyboard.${method}(${valueExpression(values.value, values.valueMode)});`];
  }

  const locator = buildLocator(values);
  const result = safeIdentifier(values.resultVariable, "result");

  switch (values.action) {
    case "locate":
      return [`const ${result} = ${locator};`];
    case "wait":
      return [
        `await ${locator}.waitFor({`,
        `  state: ${quote(values.state)},`,
        `  timeout: ${safeNumber(values.timeout, 30000)}`,
        "});"
      ];
    case "fill":
      return [`await ${locator}.fill(${valueExpression(values.value, values.valueMode)});`];
    case "upload":
      return [`await ${locator}.setInputFiles(${valueExpression(values.path, values.pathMode)});`];
    case "press":
      if (values.locatorType === "page") {
        return [`await page.keyboard.press(${valueExpression(values.value, values.valueMode)});`];
      }
      return [`await ${locator}.press(${valueExpression(values.value, values.valueMode)});`];
    case "count":
      return [`const ${result} = await ${locator}.count();`];
    case "inputValue":
      return [`const ${result} = await ${locator}.inputValue();`];
    case "isEnabled":
      return [`const ${result} = await ${locator}.isEnabled();`];
    case "isVisible":
      return [`const ${result} = await ${locator}.isVisible();`];
    case "evaluate":
      return [
        `const ${result} = await ${locator}.evaluate(`,
        `  ${rawExpression(values.functionExpression, "element => element.textContent")}`,
        ");"
      ];
    case "screenshot":
      return [
        `await ${locator}.screenshot({`,
        `  path: ${valueExpression(values.path, values.pathMode)}`,
        "});"
      ];
    case "click":
    default:
      return [
        `await ${locator}.click({`,
        `  timeout: ${safeNumber(values.timeout, 30000)}`,
        "});"
      ];
  }
}

function buildLocator(values) {
  const scope = rawExpression(values.scope, "page");
  let locator;

  switch (values.locatorType) {
    case "text":
      locator = `${scope}.getByText(${quote(values.target)}, { exact: ${Boolean(values.exact)} })`;
      break;
    case "role":
      locator = `${scope}.getByRole(${quote(values.role)}, { name: ${quote(values.target)}, exact: ${Boolean(values.exact)} })`;
      break;
    case "placeholder":
      locator = `${scope}.getByPlaceholder(${quote(values.target)}, { exact: ${Boolean(values.exact)} })`;
      break;
    case "testid":
      locator = `${scope}.getByTestId(${quote(values.target)})`;
      break;
    case "existing":
    case "expression":
      locator = rawExpression(values.target, "page");
      break;
    case "page":
      return "page";
    case "css":
    default:
      locator = `${scope}.locator(${quote(values.target)})`;
      break;
  }

  return values.nthEnabled
    ? `${locator}.nth(${safeNumber(values.nthIndex, 0)})`
    : locator;
}

function filterEnabledTree(steps) {
  return (steps || [])
    .filter(step => step.enabled !== false)
    .map(step => {
      if (step.type === "condition") {
        return {
          ...step,
          children: filterEnabledTree(step.children || []),
          elseChildren: filterEnabledTree(step.elseChildren || [])
        };
      }
      if (step.type === "loop" || step.type === "task") {
        return {
          ...step,
          children: filterEnabledTree(step.children || [])
        };
      }
      return step;
    });
}

function walkSteps(steps) {
  const result = [];
  for (const step of steps || []) {
    result.push(step);
    if (step.type === "condition") {
      result.push(...walkSteps(step.children || []));
      result.push(...walkSteps(step.elseChildren || []));
    } else if (step.type === "loop" || step.type === "task") {
      result.push(...walkSteps(step.children || []));
    }
  }
  return result;
}

function browserBootstrapLines() {
  return [
    "async function ensureCdpBrowser(options) {",
    "  const endpoint = String(options.endpoint || \"http://127.0.0.1:9222\").replace(/\\/$/, \"\");",
    "  const isReady = async () => {",
    "    try {",
    "      const response = await fetch(`${endpoint}/json/version`);",
    "      return response.ok;",
    "    } catch {",
    "      return false;",
    "    }",
    "  };",
    "",
    "  if (await isReady()) return;",
    "  if (process.platform !== \"win32\") {",
    "    throw new Error(`CDP 端口未启动：${endpoint}`);",
    "  }",
    "",
    "  const expandEnvironment = value => String(value || \"\")",
    "    .replace(/%([^%]+)%/g, (_, key) => process.env[key] || process.env[key.toUpperCase()] || \"\");",
    "  const candidates = [",
    "    expandEnvironment(options.edgePath),",
    "    process.env[\"ProgramFiles(x86)\"] && path.join(process.env[\"ProgramFiles(x86)\"], \"Microsoft\", \"Edge\", \"Application\", \"msedge.exe\"),",
    "    process.env.ProgramFiles && path.join(process.env.ProgramFiles, \"Microsoft\", \"Edge\", \"Application\", \"msedge.exe\"),",
    "    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, \"Microsoft\", \"Edge\", \"Application\", \"msedge.exe\")",
    "  ].filter(Boolean);",
    "  const edgePath = candidates.find(candidate => existsSync(candidate));",
    "  if (!edgePath) throw new Error(\"未找到 Microsoft Edge，请在多开浏览器节点填写 Edge 路径\");",
    "",
    "  const port = new URL(endpoint).port || \"9222\";",
    "  const child = spawn(edgePath, [",
    "    `--remote-debugging-port=${port}`,",
    "    `--user-data-dir=${expandEnvironment(options.userDataDir)}`,",
    "    String(options.startUrl || \"about:blank\")",
    "  ], { detached: true, stdio: \"ignore\" });",
    "  child.unref();",
    "",
    "  const deadline = Date.now() + Number(options.timeout || 30000);",
    "  while (Date.now() < deadline) {",
    "    if (await isReady()) return;",
    "    await new Promise(resolve => setTimeout(resolve, 300));",
    "  }",
    "  throw new Error(`等待 CDP 端口超时：${endpoint}`);",
    "}"
  ];
}

function section(text) {
  return `//==================== ${String(text).trim()} ====================`;
}

function stepTitle(step, number) {
  return step.values.title || `步骤 ${number}：${stepLabel(step)}`;
}

function stepLabel(step) {
  return STEP_DEFINITIONS[step.type]?.label || step.type;
}

function renderParameterizedTemplate(template, parameters = []) {
  let code = String(template || "");

  for (const parameter of parameters || []) {
    const token = new RegExp(`\\{\\{${escapeRegExp(parameter.key)}\\}\\}`, "g");
    const replacement = ["number", "boolean", "expression"].includes(parameter.type)
      ? String(parameter.value)
      : quote(parameter.value);
    code = code.replace(token, () => replacement);
  }

  return code.trim();
}

function valueExpression(value, mode) {
  return mode === "text" ? quote(value) : rawExpression(value, '""');
}

function summarizeParameters(parameters = []) {
  if (!parameters.length) return "无基础参数";
  return parameters
    .slice(0, 3)
    .map(item => `${item.label}=${shorten(item.value, 24)}`)
    .join(", ");
}

function rawExpression(value, fallback) {
  const expression = String(value || "").trim();
  return expression || fallback;
}

function safeIdentifier(value, fallback) {
  const identifier = String(value || "").trim();
  return /^[A-Za-z_$][\w$]*$/.test(identifier) ? identifier : fallback;
}

function escapeTemplateLiteral(value) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("`", "\\`");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function quote(value) {
  return JSON.stringify(String(value ?? ""));
}

function safeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeInteger(value, fallback) {
  return Math.max(0, Math.round(safeNumber(value, fallback)));
}

function normalizedWaitRange(minimum, maximum) {
  const first = safeInteger(minimum, 800);
  const second = safeInteger(maximum, 1600);
  return first <= second ? [first, second] : [second, first];
}

function shorten(value, limit = 60) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function indentLines(lines, depth) {
  const prefix = "  ".repeat(depth);
  return lines.map(line => line ? `${prefix}${line}` : "");
}

function elementActionLabel(action) {
  return {
    locate: "定位",
    click: "点击",
    wait: "等待",
    fill: "填写",
    upload: "上传",
    press: "按键",
    keyboard: "页面键盘",
    keyboardType: "键盘输入",
    count: "读取数量",
    inputValue: "读取值",
    isEnabled: "读取可用状态",
    isVisible: "读取可见状态",
    evaluate: "读取自定义值",
    screenshot: "截图"
  }[action] || action;
}

function conditionTypeLabel(type) {
  return {
    file: "文件",
    variable: "变量",
    expression: "表达式"
  }[type] || type;
}
