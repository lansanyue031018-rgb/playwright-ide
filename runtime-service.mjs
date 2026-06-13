import { spawn } from "node:child_process";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile
} from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export function createRuntimeService(root) {
  const runtimeRoot = path.join(root, "runtime");
  const scriptsDir = path.join(runtimeRoot, "scripts");
  const tasksDir = path.join(runtimeRoot, "tasks");
  const runs = new Map();
  const processes = new Map();

  async function ensureDirectories() {
    await Promise.all([
      mkdir(scriptsDir, { recursive: true }),
      mkdir(tasksDir, { recursive: true })
    ]);
  }

  async function copyScript(sourcePath) {
    await ensureDirectories();
    const source = path.resolve(String(sourcePath || ""));
    const sourceStat = await stat(source);
    if (!sourceStat.isFile()) throw new Error("指定路径不是文件");
    validateScriptExtension(source);

    const target = uniqueTarget(scriptsDir, path.basename(source));
    await copyFile(source, target);
    return scriptInfo(target, root);
  }

  async function writeCurrentScript(source, name = "current-workflow.mjs") {
    await ensureDirectories();
    const safeName = sanitizeScriptName(name);
    const target = path.join(scriptsDir, safeName);
    await writeFile(target, String(source ?? ""), "utf8");
    return scriptInfo(target, root);
  }

  async function runScript({ sourcePath, source, name } = {}) {
    const script = source !== undefined
      ? await writeCurrentScript(source, name)
      : await copyScript(sourcePath);
    const id = randomUUID();
    const run = {
      id,
      script,
      status: "running",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      exitCode: null,
      signal: null,
      stopRequested: false,
      output: ""
    };
    runs.set(id, run);

    const child = spawn(process.execPath, [
      path.join(root, "script-runner.mjs"),
      script.absolutePath
    ], {
      cwd: root,
      env: process.env,
      windowsHide: true
    });
    processes.set(id, child);

    appendOutput(child.stdout, run, "stdout");
    appendOutput(child.stderr, run, "stderr");
    child.on("error", error => {
      run.status = "failed";
      run.finishedAt = new Date().toISOString();
      appendRunOutput(run, `[process] ${error.message}\n`);
    });
    child.on("exit", (code, signal) => {
      run.exitCode = code;
      run.signal = signal || (run.stopRequested ? "SIGINT" : null);
      run.status = run.stopRequested
        ? "stopped"
        : code === 0 ? "completed" : "failed";
      run.finishedAt = new Date().toISOString();
      processes.delete(id);
    });

    return publicRun(run);
  }

  async function stopRun(id) {
    const run = runs.get(id);
    if (!run) throw new Error("未找到运行记录");
    if (!["running", "stopping"].includes(run.status)) return publicRun(run);

    run.stopRequested = true;
    run.status = "stopping";
    const child = processes.get(id);
    if (!child) return publicRun(run);

    child.kill("SIGINT");
    const timer = setTimeout(() => {
      if (!processes.has(id)) return;
      if (process.platform === "win32") {
        spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
          stdio: "ignore",
          windowsHide: true
        });
      } else {
        child.kill("SIGKILL");
      }
    }, 1200);
    timer.unref?.();

    return publicRun(run);
  }

  function getRun(id) {
    const run = runs.get(id);
    return run ? publicRun(run) : null;
  }

  function getLatestRun() {
    const run = [...runs.values()].at(-1);
    return run ? publicRun(run) : null;
  }

  async function listTasks() {
    await ensureDirectories();
    const files = await readdir(tasksDir, { withFileTypes: true });
    const tasks = [];
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith(".json")) continue;
      try {
        const content = JSON.parse(await readFile(path.join(tasksDir, file.name), "utf8"));
        tasks.push(content);
      } catch {
        // Ignore malformed task files; they remain available for manual recovery.
      }
    }
    return tasks.sort((a, b) => String(a.name).localeCompare(String(b.name), "zh-CN"));
  }

  async function saveTask(task) {
    await ensureDirectories();
    const id = task.id || randomUUID();
    const mode = ["module", "custom"].includes(task.mode)
      ? task.mode
      : "structured";
    const record = {
      id,
      name: String(task.name || "未命名任务").trim() || "未命名任务",
      mode,
      steps: Array.isArray(task.steps) ? task.steps : [],
      modulePath: String(task.modulePath || ""),
      template: mode === "custom" ? String(task.template || "") : "",
      parameters: mode === "custom" && Array.isArray(task.parameters)
        ? task.parameters
        : [],
      updatedAt: new Date().toISOString()
    };
    await writeFile(
      path.join(tasksDir, `${id}.json`),
      JSON.stringify(record, null, 2),
      "utf8"
    );
    return record;
  }

  async function importTaskModule(sourcePath, name) {
    await ensureDirectories();
    const source = path.resolve(String(sourcePath || ""));
    validateScriptExtension(source);
    const target = uniqueTarget(tasksDir, sanitizeScriptName(path.basename(source)));
    await copyFile(source, target);
    return saveTask({
      name: name || path.parse(target).name,
      mode: "module",
      modulePath: `../tasks/${path.basename(target)}`
    });
  }

  return {
    copyScript,
    getLatestRun,
    getRun,
    importTaskModule,
    listTasks,
    runScript,
    saveTask,
    stopRun,
    writeCurrentScript
  };
}

export async function probeCdp(endpoint) {
  const base = normalizeEndpoint(endpoint);
  try {
    const response = await fetch(`${base}/json/version`, {
      signal: AbortSignal.timeout(1200)
    });
    if (!response.ok) return { ready: false, endpoint: base };
    const version = await response.json();
    return { ready: true, endpoint: base, version };
  } catch {
    return { ready: false, endpoint: base };
  }
}

export async function ensureEdgeBrowser(options = {}) {
  const endpoint = normalizeEndpoint(options.endpoint);
  if (
    options.proxyServer &&
    ["environment", "direct"].includes(options.proxyAuthMode)
  ) {
    throw new Error("CDP 模式不支持代理账号密码，请改用持久化或临时隔离 Context");
  }
  const current = await probeCdp(endpoint);
  if (current.ready) {
    return {
      ...current,
      launched: false,
      configurationApplied: false,
      warning: `CDP 已存在：${endpoint}。现有 Profile 或代理不会被重新配置，请更换端口后启动新账号。`
    };
  }
  if (process.platform !== "win32") {
    throw new Error(`CDP 端口未启动：${endpoint}`);
  }

  const edgePath = resolveEdgePath(options.edgePath);
  const launchArguments = buildEdgeLaunchArguments(options);
  const userDataDir = launchArguments
    .find(argument => argument.startsWith("--user-data-dir="))
    ?.slice("--user-data-dir=".length);
  const child = spawn(edgePath, launchArguments, {
    detached: true,
    stdio: "ignore",
    windowsHide: false
  });
  child.unref();

  const deadline = Date.now() + finiteNumber(options.timeout, 30000);
  while (Date.now() < deadline) {
    const status = await probeCdp(endpoint);
    if (status.ready) return { ...status, launched: true, edgePath, userDataDir };
    await delay(300);
  }
  throw new Error(`等待 CDP 端口超时：${endpoint}`);
}

export function resolveEdgePath(configuredPath = "") {
  const candidates = [
    expandEnvironment(configuredPath),
    process.env["ProgramFiles(x86)"] &&
      path.join(process.env["ProgramFiles(x86)"], "Microsoft", "Edge", "Application", "msedge.exe"),
    process.env.ProgramFiles &&
      path.join(process.env.ProgramFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
    process.env.LOCALAPPDATA &&
      path.join(process.env.LOCALAPPDATA, "Microsoft", "Edge", "Application", "msedge.exe")
  ].filter(Boolean);
  const found = candidates.find(candidate => existsSync(candidate));
  if (!found) throw new Error("未找到 Microsoft Edge，请手动填写 Edge 路径");
  return found;
}

export function resolveBrowserUserDataDir(
  endpoint,
  configuredPath = "%TEMP%\\vidu-edge-profile-{account}-{port}",
  accountName = "account"
) {
  const port = new URL(normalizeEndpoint(endpoint)).port || "9222";
  const account = sanitizeAccountName(accountName);
  const template = String(
    configuredPath || "%TEMP%\\vidu-edge-profile-{port}"
  );
  const portAwareTemplate = template === "%TEMP%\\vidu-edge-profile"
    ? `${template}-{port}`
    : template;
  return expandEnvironment(
    portAwareTemplate
      .replaceAll("{port}", port)
      .replaceAll("{account}", account)
  );
}

export function buildEdgeLaunchArguments(options = {}) {
  const endpoint = normalizeEndpoint(options.endpoint);
  const port = new URL(endpoint).port || "9222";
  const userDataDir = resolveBrowserUserDataDir(
    endpoint,
    options.userDataDir,
    options.accountName
  );
  const argumentsList = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`
  ];

  if (options.proxyServer) {
    argumentsList.push(`--proxy-server=${options.proxyServer}`);
  }
  if (options.proxyBypass) {
    argumentsList.push(`--proxy-bypass-list=${options.proxyBypass}`);
  }
  argumentsList.push(String(options.startUrl || "about:blank"));
  return argumentsList;
}

function appendOutput(stream, run, label) {
  stream?.setEncoding("utf8");
  stream?.on("data", chunk => appendRunOutput(run, `[${label}] ${chunk}`));
}

function appendRunOutput(run, chunk) {
  run.output = `${run.output}${chunk}`.slice(-200000);
}

function publicRun(run) {
  return {
    ...run,
    script: {
      name: run.script.name,
      relativePath: run.script.relativePath
    }
  };
}

function scriptInfo(absolutePath, root) {
  return {
    name: path.basename(absolutePath),
    absolutePath,
    relativePath: path.relative(root, absolutePath).replaceAll("\\", "/")
  };
}

function validateScriptExtension(filePath) {
  if (![".mjs", ".js"].includes(path.extname(filePath).toLowerCase())) {
    throw new Error("只允许复制 .mjs 或 .js 文件");
  }
}

function sanitizeScriptName(name) {
  const parsed = path.parse(String(name || "current-workflow.mjs"));
  const base = parsed.name.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") ||
    "current-workflow";
  const extension = [".mjs", ".js"].includes(parsed.ext.toLowerCase())
    ? parsed.ext.toLowerCase()
    : ".mjs";
  return `${base}${extension}`;
}

function uniqueTarget(directory, fileName) {
  const safeName = sanitizeScriptName(fileName);
  const parsed = path.parse(safeName);
  let target = path.join(directory, safeName);
  let index = 1;
  while (existsSync(target)) {
    target = path.join(directory, `${parsed.name}-${index}${parsed.ext}`);
    index += 1;
  }
  return target;
}

function normalizeEndpoint(endpoint = "http://127.0.0.1:9222") {
  const url = new URL(String(endpoint || "http://127.0.0.1:9222"));
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error("只允许使用本机 CDP 地址");
  }
  return url.origin;
}

function expandEnvironment(value) {
  return String(value || "").replace(
    /%([^%]+)%/g,
    (_, key) => process.env[key] || process.env[key.toUpperCase()] || ""
  );
}

function sanitizeAccountName(value) {
  const ascii = String(value || "account")
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]+/g, " account ")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return ascii || "account";
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}
