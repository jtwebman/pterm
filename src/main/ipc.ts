import { ipcMain, dialog, shell, nativeTheme } from "electron";
import type {
  TerminalOpenInput,
  TerminalWriteInput,
  TerminalResizeInput,
  TerminalCloseInput,
  TerminalRestartInput,
  TerminalRestoreInput,
  ProjectCreateInput,
  ProjectUpdateInput,
  BranchCreateInput,
  BranchDeleteInput,
  SettingsUpdateInput,
} from "../shared/types.js";
import type { TerminalManager } from "./terminal-manager.js";
import type { ConfigStore } from "./config-store.js";
import type { SessionStore } from "./session-store.js";
import { createBranch, deleteBranch } from "./branch-manager.js";
import { detectWslDistros } from "./shell-resolver.js";
import { detectCommands } from "./command-detector.js";
import type { BrowserWindow } from "electron";

export function registerIpcHandlers(
  terminalManager: TerminalManager,
  configStore: ConfigStore,
  sessionStore: SessionStore,
  getMainWindow: () => BrowserWindow | null,
): void {
  // Terminal
  ipcMain.handle("terminal:open", (event, input: TerminalOpenInput) => {
    const project = configStore.getProject(input.projectId);
    if (!project) throw new Error(`Project not found: ${input.projectId}`);

    let cwd = project.folder;
    if (input.branchId) {
      const branch = project.branches.find((b) => b.id === input.branchId);
      if (branch) cwd = branch.folder;
    }

    terminalManager.open(event.sender, input, project, cwd);
  });

  ipcMain.handle("terminal:write", (_event, input: TerminalWriteInput) => {
    terminalManager.write(input.terminalId, input.data);
  });

  ipcMain.handle("terminal:resize", (_event, input: TerminalResizeInput) => {
    terminalManager.resize(input.terminalId, input.cols, input.rows);
  });

  ipcMain.handle("terminal:close", (_event, input: TerminalCloseInput) => {
    return terminalManager.closeAndDelete(input.terminalId);
  });

  ipcMain.handle("terminal:restore", (event, input: TerminalRestoreInput) => {
    return terminalManager.restore(event.sender, input.terminalId, input.cols, input.rows, configStore);
  });

  ipcMain.handle("terminal:get-saved-sessions", () => {
    return sessionStore.loadAllSessions();
  });

  ipcMain.handle("terminal:set-active-key", (_event, key: string) => {
    sessionStore.setMeta("activeTerminalKey", key);
  });

  ipcMain.handle("terminal:get-active-key", () => {
    return sessionStore.getMeta("activeTerminalKey");
  });

  ipcMain.handle("terminal:restart", (event, input: TerminalRestartInput) => {
    const info = terminalManager.getTerminalInfo(input.terminalId);
    if (!info) return;

    const project = configStore.getProject(info.projectId);
    if (!project) return;

    return terminalManager.restart(event.sender, input.terminalId, project, info.cwd);
  });

  // Projects
  ipcMain.handle("project:list", () => {
    return configStore.getProjects();
  });

  ipcMain.handle("project:create", (_event, input: ProjectCreateInput) => {
    return configStore.createProject(input);
  });

  ipcMain.handle("project:update", (_event, input: ProjectUpdateInput) => {
    return configStore.updateProject(input);
  });

  ipcMain.handle("project:delete", (_event, id: string) => {
    configStore.deleteProject(id);
  });

  // Branches
  ipcMain.handle("branch:create", async (_event, input: BranchCreateInput) => {
    const project = configStore.getProject(input.projectId);
    if (!project) throw new Error(`Project not found: ${input.projectId}`);

    const branch = await createBranch(project, input.name);
    configStore.addBranch(input.projectId, branch);
    return branch;
  });

  ipcMain.handle("branch:delete", async (_event, input: BranchDeleteInput) => {
    const project = configStore.getProject(input.projectId);
    if (!project) throw new Error(`Project not found: ${input.projectId}`);

    const branch = project.branches.find((b) => b.id === input.branchId);
    if (!branch) throw new Error(`Branch not found: ${input.branchId}`);

    await deleteBranch(project, branch);
    configStore.removeBranch(input.projectId, input.branchId);
  });

  // Settings
  ipcMain.handle("settings:get", () => {
    return configStore.getSettings();
  });

  ipcMain.handle("settings:update", (_event, input: SettingsUpdateInput) => {
    return configStore.updateSettings(input);
  });

  // Dialogs
  ipcMain.handle("dialog:pick-folder", async () => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("shell:open-external", (_event, url: string) => {
    if (!/^https?:\/\//.test(url)) return;
    return shell.openExternal(url);
  });

  // WSL detection
  ipcMain.handle("shell:detect-wsl", () => {
    return detectWslDistros();
  });

  // Command detection
  ipcMain.handle("shell:detect-commands", () => {
    return detectCommands();
  });

  // Theme
  ipcMain.handle("theme:get-native", () => {
    return nativeTheme.shouldUseDarkColors;
  });

  nativeTheme.on("updated", () => {
    const win = getMainWindow();
    if (win) {
      win.webContents.send("theme:native-changed", nativeTheme.shouldUseDarkColors);
    }
  });
}
