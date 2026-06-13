const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("flowStudioDesktop", {
  runtime: "electron"
});
