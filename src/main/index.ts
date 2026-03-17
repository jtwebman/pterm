import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, globalShortcut, Menu } from "electron";
import { TerminalManager } from "./terminal-manager.js";
import { ConfigStore } from "./config-store.js";
import { SessionStore } from "./session-store.js";
import { AiSessionTracker } from "./ai-session-tracker.js";
import { registerIpcHandlers } from "./ipc.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const configStore = new ConfigStore();
const sessionStore = new SessionStore(path.join(os.homedir(), ".pterm", "pterm.db"));
const aiSessionTracker = new AiSessionTracker();
const terminalManager = new TerminalManager();
terminalManager.setSessionStore(sessionStore);
terminalManager.setAiSessionTracker(aiSessionTracker);

// Crash recovery: mark any previously-running sessions as exited
sessionStore.markAllRunningAsExited();
// Garbage collect old sessions
sessionStore.pruneOldSessions(30);

registerIpcHandlers(terminalManager, configStore, sessionStore, () => mainWindow);

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  const iconPath = path.join(__dirname, "../../build/icon.png");
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: iconPath,
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

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  mainWindow.on("close", async (e) => {
    e.preventDefault();

    const busyCount = terminalManager.getBusyCount();
    if (busyCount > 0) {
      const { response } = await dialog.showMessageBox(mainWindow!, {
        type: "question",
        buttons: ["Close", "Cancel"],
        defaultId: 1,
        cancelId: 1,
        message: `You have ${busyCount} busy session${busyCount > 1 ? "s" : ""}. Close and save all sessions?`,
      });
      if (response !== 0) return;
    }

    sessionStore.flushAllScrollback();
    await terminalManager.closeAll();
    mainWindow?.destroy();
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

app.on("before-quit", () => {
  aiSessionTracker.stopAll();
  configStore.flushSync();
  sessionStore.close();
});
