import {
  STEP_DEFINITIONS,
  createStep
} from "./generator.js";

const METADATA_PREFIX = "// playwright-flow-studio:";
const STRING_LITERAL = String.raw`("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')`;
const LEGACY_CODE_TYPES = new Set([
  "setupCode",
  "configCode",
  "pageLookup",
  "locatorTask",
  "readValue",
  "loop",
  "waitFunction",
  "log"
]);
const LEGACY_ELEMENT_TYPES = new Set([
  "waitFor",
  "clickCss",
  "clickText",
  "clickRole",
  "fill",
  "upload",
  "press"
]);

export function parseMjs(source) {
  const text = String(source ?? "").replace(/\r\n/g, "\n");
  const metadata = parseMetadata(text);

  if (metadata) {
    return {
      steps: metadata,
      mode: "metadata",
      recognized: countSteps(metadata),
      custom: countCustomSteps(metadata)
    };
  }

  const sections = splitSections(text);
  const hasSections = sections.length > 0;
  const sourceSections = hasSections
    ? sections
    : [{ title: "手写脚本", code: stripModuleImports(text).trim() }];
  const steps = [];

  for (const section of sourceSections) {
    steps.push(...parseCodeToSteps(section.code, section.title, hasSections));
  }

  if (!steps.length) {
    steps.push(createStep("custom", {
      code: stripModuleImports(text).trim()
    }));
  }

  return {
    steps,
    mode: hasSections ? "heuristic" : "fallback",
    recognized: countSteps(steps) - countCustomSteps(steps),
    custom: countCustomSteps(steps)
  };
}

export function normalizeSteps(steps) {
  if (!Array.isArray(steps)) return [];
  return steps.flatMap(normalizeItem).filter(Boolean);
}

function normalizeItem(item) {
  if (!item || typeof item !== "object") return [];

  if (item.type === "fileCheck") {
    const condition = createStep("condition", {
      conditionType: "file",
      operand: item.values?.pathExpression || "config.file",
      operator: "notExists"
    });
    condition.id = item.id || condition.id;
    condition.enabled = item.enabled !== false;
    condition.children.push(createStep("messageAction", {
      action: "throw",
      valueMode: "template",
      message: item.values?.errorMessage || "文件不存在"
    }));
    return [condition];
  }

  if (LEGACY_ELEMENT_TYPES.has(item.type)) {
    const step = migrateLegacyElementStep(item);
    step.id = item.id || step.id;
    step.enabled = item.enabled !== false;
    return [step];
  }

  if (item.type === "condition" && item.values?.code) {
    const parsed = parseCodeToSteps(
      item.values.code,
      item.values.title || "条件分支",
      true
    );
    if (parsed.length) return parsed;
  }

  if (LEGACY_CODE_TYPES.has(item.type)) {
    const parsed = parseCodeToSteps(
      item.values?.code || "",
      item.values?.title || legacyLabel(item.type),
      true
    );
    if (parsed.length) return parsed;
  }

  if (item.type === "templateCode") {
    const code = renderParameterizedTemplate(
      item.values?.template,
      item.values?.parameters
    );
    const parsed = parseCodeToSteps(
      code,
      item.values?.title || "高级代码步骤",
      true
    );
    if (parsed.length && parsed.every(step => step.type !== "templateCode")) {
      return parsed;
    }
  }

  if (!STEP_DEFINITIONS[item.type]) {
    throw new Error(`未知步骤类型：${item.type}`);
  }

  const step = createStep(item.type, item.values);
  step.id = item.id || step.id;
  step.enabled = item.enabled !== false;
  if (item.type === "task") {
    if (step.values.mode === "structured") step.values.mode = "existing";
    step.collapsed = item.collapsed !== false;
  }

  if (item.type === "condition") {
    step.children = normalizeSteps(item.children || []);
    step.elseChildren = normalizeSteps(item.elseChildren || []);
  } else if (item.type === "loop" || item.type === "task") {
    step.children = normalizeSteps(item.children || []);
  }

  return [step];
}

function parseMetadata(source) {
  const line = source
    .split("\n")
    .find(item => item.startsWith(METADATA_PREFIX));

  if (!line) return null;

  try {
    const encoded = line.slice(METADATA_PREFIX.length).trim();
    const binary = typeof atob === "function"
      ? atob(encoded)
      : Buffer.from(encoded, "base64").toString("binary");
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    return Array.isArray(parsed) ? normalizeSteps(parsed) : null;
  } catch {
    return null;
  }
}

function splitSections(source) {
  const lines = source.split("\n");
  const markers = [];
  let offset = 0;
  let braceDepth = 0;
  const lexicalState = { blockComment: false, quote: null, escaped: false };

  for (const line of lines) {
    const match = line.match(/^\/\/=+\s*(.*?)\s*=+\s*$/);
    if (match && braceDepth === 0) {
      markers.push({
        index: offset,
        length: line.length,
        title: match[1].trim()
      });
    }

    braceDepth = updateBraceDepth(line, braceDepth, lexicalState);
    offset += line.length + 1;
  }

  if (!markers.length) return [];

  const sections = [];
  const preamble = stripModuleImports(source.slice(0, markers[0].index)).trim();
  if (preamble) {
    sections.push({ title: "脚本初始化", code: preamble });
  }

  markers.forEach((marker, index) => {
    const start = marker.index + marker.length;
    const end = markers[index + 1]?.index ?? source.length;
    const code = stripGeneratedNoise(source.slice(start, end));
    if (code || !/完成/.test(marker.title)) {
      sections.push({ title: marker.title, code });
    }
  });

  return sections;
}

function parseCodeToSteps(code, title, semanticFallback) {
  const rawCode = stripGeneratedNoise(code);
  if (!rawCode) return [];

  const commentedAction = parseCommentedAction(rawCode);
  if (commentedAction) return [commentedAction];

  const cleanCode = rawCode
    .replace(/^\s*\/\/=+\s*.*?\s*=+\s*$/gm, "")
    .trim();
  if (!cleanCode) return [];

  const special = parseSpecialSection(cleanCode);
  if (special) return special;

  const statements = splitTopLevelStatements(cleanCode);
  const steps = [];
  const unknown = [];

  for (const statement of statements) {
    const parsed = parseStatement(statement.trim(), title);
    if (parsed.length) {
      flushUnknown();
      steps.push(...parsed);
    } else if (statement.trim()) {
      unknown.push(statement.trim());
    }
  }

  flushUnknown();
  return steps;

  function flushUnknown() {
    if (!unknown.length) return;
    const unknownCode = unknown.splice(0).join("\n\n");
    if (semanticFallback) {
      steps.push(createTemplateStep(title, unknownCode, classifyCategory(title, unknownCode)));
    } else {
      steps.push(createStep("custom", { code: unknownCode }));
    }
  }
}

function parseCommentedAction(code) {
  const lines = String(code).split("\n").filter(line => line.trim());
  if (!lines.length || !lines.every(line => /^\s*\/\//.test(line))) {
    return null;
  }

  const uncommented = lines
    .map(line => line.replace(/^\s*\/\/\s?/, ""))
    .join("\n");
  const step = parseAwaitAction(uncommented);
  if (!step) return null;
  step.enabled = false;
  return step;
}

function parseSpecialSection(code) {
  const connect = code.match(new RegExp(
    String.raw`(?:(?:const|let)\s+)?([A-Za-z_$][\w$]*)\s*=\s*await\s+chromium\.connectOverCDP\(\s*${STRING_LITERAL}\s*\)`
  ));
  if (connect && !/(?:(?:const|let)\s+)?page\s*=/.test(code)) {
    return [createStep("connect", {
      endpoint: decodeLiteral(connect[2]),
      browserVariable: connect[1],
      urlIncludes: ""
    })];
  }

  if (/\.contexts\(\)/.test(code) && /\.pages\(\)/.test(code)) {
    const variable = code.match(
      /(?:(?:const|let)\s+)?([A-Za-z_$][\w$]*)\s*=\s*pages\.find/
    );
    const url = code.match(new RegExp(
      String.raw`page\.url\(\)\.includes\(\s*${STRING_LITERAL}\s*\)`
    ));
    const message = code.match(new RegExp(
      String.raw`throw\s+new\s+Error\(\s*${STRING_LITERAL}\s*\)`
    ));

    if (variable && url) {
      const steps = [createStep("findPage", {
        urlIncludes: decodeLiteral(url[1]),
        pageVariable: variable[1],
        errorMessage: message ? decodeLiteral(message[1]) : "未找到目标页面"
      })];
      const lastStatement = splitTopLevelStatements(code).at(-1) || "";
      const log = lastStatement.match(
        /^console\.(log|warn|error)\(([\s\S]*)\)\s*;?$/
      );
      if (log) steps.push(createMessageStep(log[1], log[2]));
      return steps;
    }
  }

  return null;
}

function parseStatement(statement, title) {
  if (!statement || /^import\b/.test(statement)) return [];

  const randomWait = statement.match(
    /^await\s+page\.waitForTimeout\(\s*Math\.floor\(\s*Math\.random\(\)\s*\*\s*\(\s*(\d+)\s*-\s*(\d+)\s*\+\s*1\s*\)\s*\)\s*\+\s*(\d+)\s*\)\s*;?$/
  );
  if (randomWait && randomWait[2] === randomWait[3]) {
    return [createStep("wait", {
      waitMode: "random",
      minMilliseconds: Number(randomWait[2]),
      maxMilliseconds: Number(randomWait[1])
    })];
  }

  const wait = statement.match(/^await\s+page\.waitForTimeout\(\s*(\d+)\s*\)\s*;?$/);
  if (wait) {
    return [createStep("wait", {
      waitMode: "fixed",
      milliseconds: Number(wait[1])
    })];
  }

  if (/^if\s*\(/.test(statement)) {
    const condition = parseIfStatement(statement);
    return condition ? [condition] : [];
  }

  if (/^(?:for|while)\s*\(/.test(statement)) {
    const loop = parseLoopStatement(statement);
    return loop ? [loop] : [];
  }

  const message = statement.match(/^console\.(log|warn|error)\(([\s\S]*)\)\s*;?$/);
  if (message) return [createMessageStep(message[1], message[2])];

  const thrown = statement.match(/^throw\s+new\s+Error\(([\s\S]*)\)\s*;?$/);
  if (thrown) return [createMessageStep("throw", thrown[1])];

  const locatorDeclaration = parseLocatorDeclaration(statement);
  if (locatorDeclaration) return [locatorDeclaration];

  const readDeclaration = parseReadDeclaration(statement);
  if (readDeclaration) return [readDeclaration];

  const action = parseAwaitAction(statement);
  if (action) return [action];

  if (/^const\s+config\s*=/.test(statement) || /配置/.test(title)) {
    return [createTemplateStep(title, statement, "配置模块")];
  }

  if (/waitForFunction\s*\(/.test(statement)) {
    return [createTemplateStep(title, statement, "等待页面条件")];
  }

  return [];
}

function parseLocatorDeclaration(statement) {
  const match = statement.match(
    /^(?:(?:const|let)\s+)?([A-Za-z_$][\w$]*)\s*=\s*(?!await\b)([\s\S]+?)\s*;?$/
  );
  if (!match || !looksLikeLocator(match[2])) return null;

  return createStep("elementAction", {
    action: "locate",
    locatorType: "expression",
    target: match[2].trim().replace(/;$/, ""),
    resultVariable: match[1]
  });
}

function parseReadDeclaration(statement) {
  const match = statement.match(
    /^(?:(?:const|let)\s+)?([A-Za-z_$][\w$]*)\s*=\s*await\s+([\s\S]+?)\.(count|inputValue|isEnabled|isVisible|evaluate)\(([\s\S]*)\)\s*;?$/
  );
  if (!match) return null;

  const [, resultVariable, receiver, method, args] = match;
  const action = {
    count: "count",
    inputValue: "inputValue",
    isEnabled: "isEnabled",
    isVisible: "isVisible",
    evaluate: "evaluate"
  }[method];

  return createStep("elementAction", {
    action,
    locatorType: "existing",
    target: receiver.trim(),
    resultVariable,
    functionExpression: method === "evaluate"
      ? args.trim()
      : "element => element.textContent"
  });
}

function parseAwaitAction(statement) {
  const keyboardType = statement.match(
    /^await\s+page\.keyboard\.type\(([\s\S]*)\)\s*;?$/
  );
  if (keyboardType) {
    const value = parseValue(keyboardType[1]);
    return createStep("elementAction", {
      action: "keyboard",
      keyboardMode: "type",
      value: value.value,
      valueMode: value.mode
    });
  }

  const pagePress = statement.match(
    /^await\s+page\.keyboard\.press\(([\s\S]*)\)\s*;?$/
  );
  if (pagePress) {
    const value = parseValue(pagePress[1]);
    return createStep("elementAction", {
      action: "keyboard",
      keyboardMode: "press",
      value: value.value,
      valueMode: value.mode
    });
  }

  if (/^await\s+page\.waitForFunction\(/.test(statement)) return null;

  const match = statement.match(
    /^await\s+([\s\S]+)\.(click|waitFor|fill|setInputFiles|press|screenshot)\(([\s\S]*)\)\s*;?$/
  );
  if (!match) return null;

  const [, receiver, method, args] = match;
  const locator = locatorValues(receiver.trim());

  if (method === "click") {
    return createStep("elementAction", {
      ...locator,
      action: "click",
      timeout: readNumberProperty(args, "timeout", 30000)
    });
  }

  if (method === "waitFor") {
    return createStep("elementAction", {
      ...locator,
      action: "wait",
      state: readStringProperty(args, "state", "visible"),
      timeout: readNumberProperty(args, "timeout", 30000)
    });
  }

  if (method === "fill" || method === "press") {
    const value = parseValue(args);
    return createStep("elementAction", {
      ...locator,
      action: method,
      value: value.value,
      valueMode: value.mode
    });
  }

  if (method === "setInputFiles") {
    const value = parseValue(args);
    return createStep("elementAction", {
      ...locator,
      action: "upload",
      path: value.value,
      pathMode: value.mode
    });
  }

  const path = readPropertyExpression(args, "path") || args;
  const value = parseValue(path);
  return createStep("elementAction", {
    ...locator,
    action: "screenshot",
    path: value.value,
    pathMode: value.mode
  });
}

function parseLoopStatement(statement) {
  const headerStart = statement.indexOf("(");
  const headerEnd = findMatching(statement, headerStart, "(", ")");
  if (headerEnd < 0) return null;
  const bodyStart = statement.indexOf("{", headerEnd);
  const bodyEnd = findMatching(statement, bodyStart, "{", "}");
  if (bodyStart < 0 || bodyEnd < 0) return null;

  const header = statement.slice(headerStart + 1, headerEnd).trim();
  const body = statement.slice(bodyStart + 1, bodyEnd);
  let step;

  if (statement.startsWith("while")) {
    step = createStep("loop", {
      loopType: "while",
      conditionExpression: header
    });
  } else {
    const forOf = header.match(
      /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s+of\s+([\s\S]+)$/
    );
    if (forOf) {
      step = createStep("loop", {
        loopType: "forOf",
        itemVariable: forOf[1],
        iterableExpression: forOf[2].trim()
      });
    } else {
      const count = header.match(
        /^(?:let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;]+);\s*\1\s*<\s*([^;]+);\s*\1\s*\+=\s*([^;]+)$/
      );
      if (!count) return null;
      step = createStep("loop", {
        loopType: "count",
        indexVariable: count[1],
        start: parseNumericOrText(count[2].trim()),
        endExpression: count[3].trim(),
        increment: parseNumericOrText(count[4].trim())
      });
    }
  }

  step.children = parseCodeToSteps(body, "循环体", true);
  return step;
}

function parseIfStatement(statement) {
  const conditionStart = statement.indexOf("(");
  const conditionEnd = findMatching(statement, conditionStart, "(", ")");
  if (conditionEnd < 0) return null;

  const bodyStart = statement.indexOf("{", conditionEnd);
  const bodyEnd = findMatching(statement, bodyStart, "{", "}");
  if (bodyStart < 0 || bodyEnd < 0) return null;

  const rawCondition = statement.slice(conditionStart + 1, conditionEnd).trim();
  const body = statement.slice(bodyStart + 1, bodyEnd);
  const remainder = statement.slice(bodyEnd + 1).trim().replace(/;$/, "").trim();
  let elseBody = "";

  if (remainder.startsWith("else")) {
    const elseStart = remainder.indexOf("{");
    const elseEnd = findMatching(remainder, elseStart, "{", "}");
    if (elseStart >= 0 && elseEnd >= 0) {
      elseBody = remainder.slice(elseStart + 1, elseEnd);
    }
  }

  const inferred = inferCondition(rawCondition);
  const step = createStep("condition", {
    ...inferred,
    elseEnabled: Boolean(elseBody)
  });
  step.children = parseCodeToSteps(body, "条件成立", true);
  step.elseChildren = elseBody
    ? parseCodeToSteps(elseBody, "否则", true)
    : [];
  return step;
}

function inferCondition(rawCondition) {
  const condition = stripOuterParentheses(rawCondition.trim());
  const negativeFile = condition.match(/^!fs\.existsSync\(([\s\S]+)\)$/);
  if (negativeFile) {
    return {
      conditionType: "file",
      operand: negativeFile[1].trim(),
      operator: "notExists"
    };
  }

  const positiveFile = condition.match(/^fs\.existsSync\(([\s\S]+)\)$/);
  if (positiveFile) {
    return {
      conditionType: "file",
      operand: positiveFile[1].trim(),
      operator: "exists"
    };
  }

  const negativeVariable = condition.match(
    /^!([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)$/
  );
  if (negativeVariable) {
    return {
      conditionType: "variable",
      operand: negativeVariable[1],
      operator: "falsy"
    };
  }

  if (/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(condition)) {
    return {
      conditionType: "variable",
      operand: condition,
      operator: "truthy"
    };
  }

  const negatedExpression = condition.match(/^!\(([\s\S]+)\)$/);
  return {
    conditionType: "expression",
    operand: negatedExpression ? negatedExpression[1].trim() : condition,
    operator: negatedExpression ? "falsy" : "truthy"
  };
}

function locatorValues(receiver) {
  const nthMatch = receiver.match(/^([\s\S]+)\.nth\(\s*(-?\d+)\s*\)$/);
  const nthValues = nthMatch
    ? { nthEnabled: true, nthIndex: Number(nthMatch[2]) }
    : { nthEnabled: false, nthIndex: 0 };
  const baseReceiver = nthMatch ? nthMatch[1].trim() : receiver;
  const existing = receiver.match(/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*\([^)]*\))*$/);
  if (existing && !baseReceiver.startsWith("page.")) {
    return {
      locatorType: "existing",
      target: baseReceiver,
      ...nthValues
    };
  }

  const role = baseReceiver.match(new RegExp(
    String.raw`^([A-Za-z_$][\w$]*)\.getByRole\(\s*${STRING_LITERAL}\s*,\s*\{[\s\S]*?name:\s*${STRING_LITERAL}[\s\S]*?exact:\s*(true|false)`
  ));
  if (role) {
    return {
      locatorType: "role",
      scope: role[1],
      role: decodeLiteral(role[2]),
      target: decodeLiteral(role[3]),
      exact: role[4] === "true",
      ...nthValues
    };
  }

  const css = baseReceiver.match(new RegExp(
    String.raw`^([A-Za-z_$][\w$]*)\.locator\(\s*${STRING_LITERAL}\s*\)$`
  ));
  if (css) {
    return {
      locatorType: "css",
      scope: css[1],
      target: decodeLiteral(css[2]),
      ...nthValues
    };
  }

  return {
    locatorType: "expression",
    target: baseReceiver,
    ...nthValues
  };
}

function createMessageStep(action, expression) {
  const parsed = parseValue(expression);
  return createStep("messageAction", {
    action,
    valueMode: parsed.mode === "text" ? "text" : parsed.mode,
    message: parsed.value
  });
}

function parseValue(expression) {
  const value = String(expression || "").trim().replace(/;$/, "");
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return { mode: "text", value: decodeLiteral(value) };
  }

  if (value.startsWith("`") && value.endsWith("`")) {
    return { mode: "template", value: value.slice(1, -1) };
  }

  return { mode: "expression", value };
}

function migrateLegacyElementStep(item) {
  const values = item.values || {};

  switch (item.type) {
    case "waitFor":
      return createStep("elementAction", {
        action: "wait",
        locatorType: "css",
        target: values.selector,
        state: values.state,
        timeout: values.timeout
      });
    case "clickCss":
      return createStep("elementAction", {
        action: "click",
        locatorType: "css",
        target: values.selector,
        timeout: values.timeout
      });
    case "clickText":
      return createStep("elementAction", {
        action: "click",
        locatorType: "text",
        target: values.text,
        exact: values.exact,
        timeout: values.timeout
      });
    case "clickRole":
      return createStep("elementAction", {
        action: "click",
        locatorType: "role",
        role: values.role,
        target: values.name,
        exact: values.exact,
        timeout: values.timeout
      });
    case "fill":
      return createStep("elementAction", {
        action: "fill",
        locatorType: "css",
        target: values.selector,
        value: values.value,
        valueMode: "text"
      });
    case "upload":
      return createStep("elementAction", {
        action: "upload",
        locatorType: "css",
        target: values.selector,
        nthEnabled: true,
        nthIndex: values.index,
        path: values.path,
        pathMode: "text"
      });
    case "press":
      return createStep("elementAction", {
        action: values.selector ? "press" : "keyboard",
        keyboardMode: "press",
        locatorType: values.selector ? "css" : "page",
        target: values.selector,
        value: values.key,
        valueMode: "text"
      });
    default:
      return createStep("custom", { code: values.code || "" });
  }
}

function splitTopLevelStatements(code) {
  const statements = [];
  let start = 0;
  let braces = 0;
  let parens = 0;
  let brackets = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < code.length; index += 1) {
    const char = code[index];
    const next = code[index + 1];

    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") braces += 1;
    if (char === "}") braces -= 1;
    if (char === "(") parens += 1;
    if (char === ")") parens -= 1;
    if (char === "[") brackets += 1;
    if (char === "]") brackets -= 1;

    if (char === ";" && braces === 0 && parens === 0 && brackets === 0) {
      statements.push(code.slice(start, index + 1).trim());
      start = index + 1;
      continue;
    }

    if (char === "}" && braces === 0 && parens === 0 && brackets === 0) {
      const current = code.slice(start, index + 1).trim();
      if (/^(?:if|for|while|function|async\s+function)\b/.test(current)) {
        const remainder = code.slice(index + 1);
        if (!/^\s*(?:else|catch|finally)\b/.test(remainder)) {
          statements.push(current);
          start = index + 1;
        }
      }
    }
  }

  const tail = code.slice(start).trim();
  if (tail) statements.push(tail);
  return statements;
}

function findMatching(source, start, open, close) {
  if (start < 0 || source[start] !== open) return -1;
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === open) depth += 1;
    if (char === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function updateBraceDepth(line, initialDepth, state) {
  let depth = initialDepth;
  let lineComment = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (lineComment) break;
    if (state.blockComment) {
      if (char === "*" && next === "/") {
        state.blockComment = false;
        index += 1;
      }
      continue;
    }
    if (state.quote) {
      if (state.escaped) state.escaped = false;
      else if (char === "\\") state.escaped = true;
      else if (char === state.quote) state.quote = null;
      continue;
    }
    if (char === "/" && next === "/") {
      lineComment = true;
      break;
    }
    if (char === "/" && next === "*") {
      state.blockComment = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      state.quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
  }

  return depth;
}

function looksLikeLocator(expression) {
  return (
    /\b(?:page|[A-Za-z_$][\w$]*)\.locator\s*\(/.test(expression) ||
    /\.getBy(?:Role|Text|Placeholder|Label|TestId)\s*\(/.test(expression) ||
    /\.(?:filter|nth|first|last)\s*\(/.test(expression)
  );
}

function readNumberProperty(source, key, fallback) {
  const match = String(source).match(new RegExp(`${key}\\s*:\\s*(\\d+)`));
  return match ? Number(match[1]) : fallback;
}

function readStringProperty(source, key, fallback) {
  const match = String(source).match(new RegExp(`${key}\\s*:\\s*${STRING_LITERAL}`));
  return match ? decodeLiteral(match[1]) : fallback;
}

function readPropertyExpression(source, key) {
  const match = String(source).match(new RegExp(`${key}\\s*:\\s*([^,}]+)`));
  return match ? match[1].trim() : "";
}

function createTemplateStep(title, code, category) {
  const parameterized = parameterizeCode(code);
  return createStep("templateCode", {
    title,
    category,
    template: parameterized.template,
    parameters: parameterized.parameters
  });
}

export function parameterizeCode(code, options = {}) {
  const parameters = [];
  let index = 0;
  const source = String(code || "");
  const tokenPattern = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|\b(true|false)\b|(?<![\w$])(\d+(?:\.\d+)?)(?![\w$])/g;

  let template = source.replace(
    tokenPattern,
    (match, literal, booleanValue, numberValue, offset) => {
      if (isInsideTemplateLiteral(source, offset)) return match;
      const type = literal ? "string" : booleanValue ? "boolean" : "number";
      const value = literal ? decodeLiteral(literal) : booleanValue ?? numberValue;
      const key = `param${++index}`;
      parameters.push({
        key,
        label: inferParameterLabel(source, offset, type, index),
        type,
        value
      });
      return `{{${key}}}`;
    }
  );

  for (const extra of options.extraParameters || []) {
    const key = sanitizeParameterKey(extra.key || `param${++index}`);
    const match = String(extra.match ?? extra.value ?? "");
    const existing = parameters.find(parameter => String(parameter.value) === match);
    if (existing) {
      template = template.replaceAll(`{{${existing.key}}}`, `{{${key}}}`);
      existing.key = key;
      existing.label = extra.label || key;
      existing.type = extra.type || existing.type || "string";
      existing.value = extra.value ?? match;
      existing.options = Array.isArray(extra.options) ? extra.options : [];
      continue;
    }
    const token = `{{${key}}}`;
    if (match && !template.includes(token)) {
      template = template.replace(match, token);
    }
    parameters.push({
      key,
      label: extra.label || key,
      type: extra.type || "string",
      value: extra.value ?? match,
      options: Array.isArray(extra.options) ? extra.options : []
    });
  }

  return { template, parameters };
}

export function finalizeParameterizedTemplate(template, parameters = []) {
  let code = String(template || "");
  const selected = [];

  for (const parameter of parameters) {
    if (parameter.enabled === false) {
      const token = new RegExp(`\\{\\{${escapeRegExp(parameter.key)}\\}\\}`, "g");
      code = code.replace(token, () => renderParameterValue(parameter));
      continue;
    }

    selected.push({
      key: parameter.key,
      label: parameter.label || parameter.key,
      type: parameter.type || "string",
      value: parameter.value,
      options: Array.isArray(parameter.options) ? parameter.options : []
    });
  }

  return { template: code, parameters: selected };
}

function renderParameterizedTemplate(template, parameters = []) {
  let code = String(template || "");
  for (const parameter of parameters || []) {
    const token = new RegExp(`\\{\\{${escapeRegExp(parameter.key)}\\}\\}`, "g");
    const replacement = renderParameterValue(parameter);
    code = code.replace(token, () => replacement);
  }
  return code.trim();
}

function renderParameterValue(parameter) {
  return ["number", "boolean", "expression"].includes(parameter.type)
    ? String(parameter.value)
    : JSON.stringify(String(parameter.value ?? ""));
}

function sanitizeParameterKey(value) {
  const key = String(value || "param")
    .trim()
    .replace(/[^A-Za-z0-9_$]+/g, "_");
  return /^[A-Za-z_$]/.test(key) ? key : `param_${key}`;
}

function inferParameterLabel(source, offset, type, index) {
  const context = source.slice(Math.max(0, offset - 80), offset);
  const property = context.match(/([A-Za-z_$][\w$]*)\s*:\s*$/);
  if (property) return property[1];
  if (/locator\(\s*$/.test(context)) return "CSS 选择器";
  if (/setInputFiles\(\s*$/.test(context)) return "文件路径";
  if (/console\.(?:log|warn|error)\(\s*$/.test(context)) return "日志文字";
  return `${type === "number" ? "数字" : type === "boolean" ? "开关" : "文本"} ${index}`;
}

function classifyCategory(title, code) {
  if (/配置/.test(title) || /\bconst\s+config\s*=/.test(code)) return "配置模块";
  if (/^(?:for|while)\s*\(/.test(code)) return "循环步骤";
  if (/waitForFunction/.test(code)) return "等待页面条件";
  if (/locator|getBy|click|fill|waitFor|setInputFiles/.test(code)) return "定位与操作";
  return "高级代码";
}

function legacyLabel(type) {
  return {
    setupCode: "脚本初始化",
    configCode: "配置模块",
    pageLookup: "查找页面",
    locatorTask: "定位与操作",
    readValue: "读取页面值",
    loop: "循环步骤",
    waitFunction: "等待页面条件",
    log: "日志输出"
  }[type] || "高级代码步骤";
}

function stripGeneratedNoise(code) {
  return stripModuleImports(String(code || ""))
    .replace(/\/\/ playwright-flow-studio:[A-Za-z0-9+/=]+\s*/g, "")
    .replace(
      /^\s*let\s+[A-Za-z_$][\w$]*(?:\s*,\s*[A-Za-z_$][\w$]*)*\s*;\s*$/gm,
      ""
    )
    .replace(/console\.log\(\s*"自动化步骤执行完成"\s*\)\s*;?/g, "")
    .trim();
}

function stripModuleImports(code) {
  return code.replace(
    /^\s*import\s+[^;\n]+;?\s*/gm,
    ""
  );
}

function stripOuterParentheses(value) {
  let result = value;
  while (result.startsWith("(") && findMatching(result, 0, "(", ")") === result.length - 1) {
    result = result.slice(1, -1).trim();
  }
  return result;
}

function decodeLiteral(literal) {
  if (literal.startsWith('"')) return JSON.parse(literal);
  return literal
    .slice(1, -1)
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, "\\")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t");
}

function countSteps(steps) {
  let count = 0;
  for (const step of steps || []) {
    count += 1;
    if (step.type === "condition") {
      count += countSteps(step.children);
      count += countSteps(step.elseChildren);
    } else if (step.type === "loop" || step.type === "task") {
      count += countSteps(step.children);
    }
  }
  return count;
}

function countCustomSteps(steps) {
  let count = 0;
  for (const step of steps || []) {
    if (step.type === "custom") count += 1;
    if (step.type === "condition") {
      count += countCustomSteps(step.children);
      count += countCustomSteps(step.elseChildren);
    } else if (step.type === "loop" || step.type === "task") {
      count += countCustomSteps(step.children);
    }
  }
  return count;
}

function isInsideTemplateLiteral(source, offset) {
  const before = source.slice(0, offset);
  return ((before.match(/(?<!\\)`/g) || []).length % 2) === 1;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseNumericOrText(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}
