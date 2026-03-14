import fs from "node:fs";
import { execFile } from "node:child_process";
import type { ShellType } from "../shared/types.js";

interface ResolvedShell {
  file: string;
  args: string[];
}

export function resolveShell(shellType?: ShellType, wslDistro?: string): ResolvedShell {
  if (shellType === "wsl") {
    return {
      file: "wsl.exe",
      args: ["-d", wslDistro || "Ubuntu", "--", "bash", "-l"],
    };
  }

  if (process.platform === "win32") {
    return resolveWindowsShell(shellType);
  }

  return resolveUnixShell(shellType);
}

function resolveUnixShell(shellType?: ShellType): ResolvedShell {
  if (shellType === "bash") return { file: "/bin/bash", args: ["-l"] };
  if (shellType === "zsh") return { file: "/bin/zsh", args: ["-l"] };

  // Default fallback chain
  const envShell = process.env.SHELL;
  if (envShell && isExecutable(envShell)) {
    return { file: envShell, args: ["-l"] };
  }
  if (isExecutable("/bin/zsh")) return { file: "/bin/zsh", args: ["-l"] };
  if (isExecutable("/bin/bash")) return { file: "/bin/bash", args: ["-l"] };
  return { file: "/bin/sh", args: ["-l"] };
}

function resolveWindowsShell(shellType?: ShellType): ResolvedShell {
  if (shellType === "cmd") return { file: "cmd.exe", args: [] };
  if (shellType === "powershell") return { file: "powershell.exe", args: [] };

  const comspec = process.env.ComSpec;
  if (comspec) return { file: comspec, args: [] };
  return { file: "powershell.exe", args: [] };
}

function isExecutable(path: string): boolean {
  try {
    fs.accessSync(path, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function detectWslDistros(): Promise<string[]> {
  return new Promise((resolve) => {
    execFile("wsl.exe", ["-l", "-q"], { encoding: "buffer" }, (err, stdout) => {
      if (err) {
        resolve([]);
        return;
      }
      // wsl.exe outputs UTF-16LE — strip BOM and null bytes
      const text = stdout
        .toString("utf16le")
        .replace(/\0/g, "")
        .replace(/^\uFEFF/, "");
      const distros = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      resolve(distros);
    });
  });
}
