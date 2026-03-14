import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, globalShortcut, Menu } from "electron";
import { TerminalManager } from "./terminal-manager.js";
import { ConfigStore } from "./config-store.js";
import { registerIpcHandlers } from "./ipc.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const configStore = new ConfigStore();
const terminalManager = new TerminalManager();

registerIpcHandlers(terminalManager, configStore);

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "../preload/index.cjs"),
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  mainWindow.on("close", async (e) => {
    const termCount = terminalManager.getTerminalCount();
    if (termCount === 0) return;

    e.preventDefault();

    const busyCount = terminalManager.getBusyCount();
    const message =
      busyCount > 0
        ? `You have ${termCount} terminal session${termCount > 1 ? "s" : ""} (${busyCount} busy). Close all?`
        : `You have ${termCount} terminal session${termCount > 1 ? "s" : ""}. Close all?`;

    const { response } = await dialog.showMessageBox(mainWindow!, {
      type: "question",
      buttons: ["Close All", "Cancel"],
      defaultId: 1,
      cancelId: 1,
      message,
    });

    if (response === 0) {
      await terminalManager.closeAll();
      mainWindow?.destroy();
    }
  });
}

app.whenReady().then(() => {
  if (process.platform === "darwin") {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: app.name,
          submenu: [
            { role: "about" },
            { type: "separator" },
            { role: "hide" },
            { role: "hideOthers" },
            { role: "unhide" },
            { type: "separator" },
            { role: "quit" },
          ],
        },
        {
          label: "Edit",
          submenu: [
            { role: "copy" },
            { role: "paste" },
            { role: "selectAll" },
          ],
        },
        {
          label: "Window",
          submenu: [
            { role: "minimize" },
            { role: "zoom" },
            { role: "close" },
          ],
        },
      ])
    );
  } else {
    Menu.setApplicationMenu(null);
  }
  createWindow();

  if (process.env.VITE_DEV_SERVER_URL) {
    globalShortcut.register("CmdOrCtrl+Shift+I", () => {
      mainWindow?.webContents.toggleDevTools();
    });
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("before-quit", async () => {
  await terminalManager.closeAll();
  configStore.flushSync();
});
