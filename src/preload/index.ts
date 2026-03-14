import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("ptermBridge", {
  terminal: {
    open: (input: any) => ipcRenderer.invoke("terminal:open", input),
    write: (input: any) => ipcRenderer.invoke("terminal:write", input),
    resize: (input: any) => ipcRenderer.invoke("terminal:resize", input),
    close: (input: any) => ipcRenderer.invoke("terminal:close", input),
    restart: (input: any) => ipcRenderer.invoke("terminal:restart", input),
    onData: (terminalId: string, cb: (data: string) => void) => {
      ipcRenderer.on(`terminal:data:${terminalId}`, (_event, data) => cb(data));
    },
    offData: (terminalId: string) => {
      ipcRenderer.removeAllListeners(`terminal:data:${terminalId}`);
    },
    onExit: (terminalId: string, cb: (data: { exitCode: number; signal?: number }) => void) => {
      ipcRenderer.on(`terminal:exit:${terminalId}`, (_event, data) => cb(data));
    },
    offExit: (terminalId: string) => {
      ipcRenderer.removeAllListeners(`terminal:exit:${terminalId}`);
    },
    onBusy: (terminalId: string, cb: (busy: boolean) => void) => {
      ipcRenderer.on(`terminal:busy:${terminalId}`, (_event, busy) => cb(busy));
    },
    offBusy: (terminalId: string) => {
      ipcRenderer.removeAllListeners(`terminal:busy:${terminalId}`);
    },
  },
  project: {
    list: () => ipcRenderer.invoke("project:list"),
    create: (input: any) => ipcRenderer.invoke("project:create", input),
    update: (input: any) => ipcRenderer.invoke("project:update", input),
    delete: (id: string) => ipcRenderer.invoke("project:delete", id),
  },
  branch: {
    create: (input: any) => ipcRenderer.invoke("branch:create", input),
    delete: (input: any) => ipcRenderer.invoke("branch:delete", input),
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    update: (input: any) => ipcRenderer.invoke("settings:update", input),
  },
  dialog: {
    pickFolder: () => ipcRenderer.invoke("dialog:pick-folder"),
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke("shell:open-external", url),
  },
  platform: process.platform,
});
