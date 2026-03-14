import * as pty from "node-pty";
import { exec } from "node:child_process";
import type { WebContents } from "electron";
import type { TerminalOpenInput, Project } from "../shared/types.js";
import { resolveShell } from "./shell-resolver.js";
import { filterEnv } from "./env-filter.js";

interface ManagedTerminal {
  pty: pty.IPty;
  webContents: WebContents;
  terminalId: string;
  projectId: string;
  branchId?: string;
  commandId?: string;
  cwd: string;
  busy: boolean;
  pollTimer: ReturnType<typeof setInterval>;
  envVars?: Record<string, string>;
  cols: number;
  rows: number;
}

export class TerminalManager {
  private terminals = new Map<string, ManagedTerminal>();

  open(
    webContents: WebContents,
    input: TerminalOpenInput,
    project: Project,
    cwd: string,
  ): void {
    const command = input.commandId
      ? project.commands.find((c) => c.id === input.commandId)
      : undefined;

    const shell = resolveShell(command?.shell);
    const env = filterEnv(project.envVars);

    const args = [...shell.args];
    if (command?.command) {
      // For non-empty commands, execute them in the shell
      if (process.platform === "win32") {
        args.push("/c", command.command);
      } else {
        args.push("-c", command.command);
      }
    }

    const ptyProcess = pty.spawn(shell.file, args, {
      name: "xterm-256color",
      cols: input.cols,
      rows: input.rows,
      cwd,
      env,
    });

    const pollTimer = setInterval(() => {
      this.pollActivity(input.terminalId);
    }, 2500);

    const managed: ManagedTerminal = {
      pty: ptyProcess,
      webContents,
      terminalId: input.terminalId,
      projectId: input.projectId,
      branchId: input.branchId,
      commandId: input.commandId,
      cwd,
      busy: false,
      pollTimer,
      envVars: project.envVars,
      cols: input.cols,
      rows: input.rows,
    };

    this.terminals.set(input.terminalId, managed);

    ptyProcess.onData((data) => {
      if (!webContents.isDestroyed()) {
        webContents.send(`terminal:data:${input.terminalId}`, data);
      }
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      clearInterval(pollTimer);
      if (!webContents.isDestroyed()) {
        webContents.send(`terminal:exit:${input.terminalId}`, { exitCode, signal });
      }
      this.terminals.delete(input.terminalId);
    });
  }

  write(terminalId: string, data: string): void {
    const t = this.terminals.get(terminalId);
    if (t) t.pty.write(data);
  }

  resize(terminalId: string, cols: number, rows: number): void {
    const t = this.terminals.get(terminalId);
    if (t) {
      t.pty.resize(cols, rows);
      t.cols = cols;
      t.rows = rows;
    }
  }

  close(terminalId: string): Promise<void> {
    const t = this.terminals.get(terminalId);
    if (!t) return Promise.resolve();

    return new Promise<void>((resolve) => {
      clearInterval(t.pollTimer);

      const killTimeout = setTimeout(() => {
        try {
          t.pty.kill("SIGKILL");
        } catch {
          // already dead
        }
        this.terminals.delete(terminalId);
        resolve();
      }, 1000);

      t.pty.onExit(() => {
        clearTimeout(killTimeout);
        this.terminals.delete(terminalId);
        resolve();
      });

      try {
        t.pty.kill();
      } catch {
        clearTimeout(killTimeout);
        this.terminals.delete(terminalId);
        resolve();
      }
    });
  }

  async restart(
    webContents: WebContents,
    terminalId: string,
    project: Project,
    cwd: string,
  ): Promise<void> {
    const t = this.terminals.get(terminalId);
    if (!t) return;

    const { cols, rows, commandId, branchId, projectId } = t;
    await this.close(terminalId);
    this.open(webContents, { projectId, terminalId, commandId, branchId, cols, rows }, project, cwd);
  }

  async closeAll(): Promise<void> {
    const promises = [...this.terminals.keys()].map((id) => this.close(id));
    await Promise.all(promises);
  }

  getBusyCount(): number {
    let count = 0;
    for (const t of this.terminals.values()) {
      if (t.busy) count++;
    }
    return count;
  }

  getTerminalCount(): number {
    return this.terminals.size;
  }

  getTerminalInfo(terminalId: string): { projectId: string; cwd: string } | undefined {
    const t = this.terminals.get(terminalId);
    if (!t) return undefined;
    return { projectId: t.projectId, cwd: t.cwd };
  }

  private pollActivity(terminalId: string): void {
    const t = this.terminals.get(terminalId);
    if (!t) return;

    const pid = t.pty.pid;
    if (process.platform === "win32") {
      exec(
        `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"ParentProcessId=${pid}\\" | Select-Object -First 1"`,
        (err, stdout) => {
          this.updateBusy(terminalId, !err && stdout.trim().length > 0);
        },
      );
    } else {
      exec(`pgrep -P ${pid}`, (err, stdout) => {
        if (err) {
          // pgrep not available, try ps fallback
          exec(`ps -eo pid=,ppid=`, (err2, stdout2) => {
            if (err2) {
              this.updateBusy(terminalId, false);
              return;
            }
            const hasChild = stdout2
              .split("\n")
              .some((line) => {
                const parts = line.trim().split(/\s+/);
                return parts[1] === String(pid);
              });
            this.updateBusy(terminalId, hasChild);
          });
          return;
        }
        this.updateBusy(terminalId, stdout.trim().length > 0);
      });
    }
  }

  private updateBusy(terminalId: string, busy: boolean): void {
    const t = this.terminals.get(terminalId);
    if (!t || t.busy === busy) return;
    t.busy = busy;
    if (!t.webContents.isDestroyed()) {
      t.webContents.send(`terminal:busy:${terminalId}`, busy);
    }
  }
}
