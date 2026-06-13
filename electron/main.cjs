const { app, BrowserWindow, shell } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");

const APP_URL = process.env.FLOW_STUDIO_URL || "http://127.0.0.1:8765";
const SERVER_READY_URL = `${APP_URL}/api/health`;
let serverProcess = null;

function projectRoot() {
  return app.isPackaged ? process.resourcesPath : path.join(__dirname, "..");
}

function startLocalServer() {
  if (process.env.FLOW_STUDIO_URL) return;
  const root = projectRoot();
  const serverEntry = path.join(root, "server.mjs");
  serverProcess = spawn(process.execPath, [serverEntry], {
    cwd: root,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: process.env.NODE_ENV || "production"
    },
    stdio: "ignore",
    windowsHide: true
  });
}

async function waitForServer(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(SERVER_READY_URL);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error(`Flow Studio server did not become ready at ${SERVER_READY_URL}`);
}

async function createWindow() {
  startLocalServer();
  await waitForServer();

  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    title: "Playwright Flow Studio",
    backgroundColor: "#080c12",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  await win.loadURL(APP_URL);
}

app.whenReady().then(createWindow).catch(error => {
  console.error(error);
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverProcess && !serverProcess.killed) serverProcess.kill();
});
