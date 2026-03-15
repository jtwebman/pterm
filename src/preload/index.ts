import { contextBridge, ipcRenderer } from "electron";
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
  ActivityUpdate,
} from "../shared/types.js";

contextBridge.exposeInMainWorld("ptermBridge", {
  terminal: {
    open: (input: TerminalOpenInput) => ipcRenderer.invoke("terminal:open", input),
    write: (input: TerminalWriteInput) => ipcRenderer.invoke("terminal:write", input),
    resize: (input: TerminalResizeInput) => ipcRenderer.invoke("terminal:resize", input),
    close: (input: TerminalCloseInput) => ipcRenderer.invoke("terminal:close", input),
    restart: (input: TerminalRestartInput) => ipcRenderer.invoke("terminal:restart", input),
    restore: (input: TerminalRestoreInput) => ipcRenderer.invoke("terminal:restore", input),
    getSavedSessions: () => ipcRenderer.invoke("terminal:get-saved-sessions"),
    setActiveKey: (key: string) => ipcRenderer.invoke("terminal:set-active-key", key),
    getActiveKey: () => ipcRenderer.invoke("terminal:get-active-key"),
    onData: (terminalId: string, cb: (data: string) => void) => {
      ipcRenderer.on(`terminal:data:${terminalId}`, (_event: any, data) => cb(data));
    },
    offData: (terminalId: string) => {
      ipcRenderer.removeAllListeners(`terminal:data:${terminalId}`);
    },
    onExit: (terminalId: string, cb: (data: { exitCode: number; signal?: number }) => void) => {
      ipcRenderer.on(`terminal:exit:${terminalId}`, (_event: any, data) => cb(data));
    },
    offExit: (terminalId: string) => {
      ipcRenderer.removeAllListeners(`terminal:exit:${terminalId}`);
    },
    onActivity: (terminalId: string, cb: (data: ActivityUpdate) => void) => {
      ipcRenderer.on(`terminal:activity:${terminalId}`, (_event: any, data) => cb(data));
    },
    offActivity: (terminalId: string) => {
      ipcRenderer.removeAllListeners(`terminal:activity:${terminalId}`);
    },
  },
  project: {
    list: () => ipcRenderer.invoke("project:list"),
    create: (input: ProjectCreateInput) => ipcRenderer.invoke("project:create", input),
    update: (input: ProjectUpdateInput) => ipcRenderer.invoke("project:update", input),
    delete: (id: string) => ipcRenderer.invoke("project:delete", id),
  },
  branch: {
    create: (input: BranchCreateInput) => ipcRenderer.invoke("branch:create", input),
    delete: (input: BranchDeleteInput) => ipcRenderer.invoke("branch:delete", input),
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    update: (input: SettingsUpdateInput) => ipcRenderer.invoke("settings:update", input),
  },
  dialog: {
    pickFolder: () => ipcRenderer.invoke("dialog:pick-folder"),
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke("shell:open-external", url),
    detectWsl: () => ipcRenderer.invoke("shell:detect-wsl"),
    detectCommands: () => ipcRenderer.invoke("shell:detect-commands"),
  },
  theme: {
    getNative: () => ipcRenderer.invoke("theme:get-native"),
    onNativeChanged: (cb: (isDark: boolean) => void) => {
      const handler = (_event: any, isDark: boolean) => cb(isDark);
      ipcRenderer.on("theme:native-changed", handler);
      return () => {
        ipcRenderer.removeListener("theme:native-changed", handler);
      };
    },
  },
  platform: process.platform,
});
