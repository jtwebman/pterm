import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { bridge } from "../bridge.js";
import { useApp } from "../store.js";
import type { TerminalSession } from "../../shared/types.js";

const MIN_FONT_SIZE = 6;
const MAX_FONT_SIZE = 32;

interface Props {
  terminal: TerminalSession;
}

export function TerminalPane({ terminal }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { state, dispatch } = useApp();
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  // Sync font size changes into a live terminal
  useEffect(() => {
    const xterm = xtermRef.current;
    const fitAddon = fitAddonRef.current;
    if (!xterm || !fitAddon) return;
    xterm.options.fontSize = state.fontSize;
    fitAddon.fit();
    bridge.terminal.resize({
      terminalId: terminal.terminalId,
      cols: xterm.cols,
      rows: xterm.rows,
    });
  }, [state.fontSize]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let aborted = false;

    const xterm = new Terminal({
      cursorBlink: true,
      fontSize: state.fontSize,
      fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', Menlo, Monaco, 'Courier New', monospace",
      scrollback: 100_000,
      theme: {
        background: "#1e1e1e",
        foreground: "#d4d4d4",
        cursor: "#d4d4d4",
      },
    });
    xtermRef.current = xterm;

    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    xterm.loadAddon(fitAddon);
    xterm.open(el);

    // Copy/paste keybindings
    // Mac: Cmd+C/V handled natively by the browser
    // Windows/Linux: Ctrl+C copies if there's a selection, otherwise passes through as SIGINT
    //                Ctrl+Shift+C always copies, Ctrl+V / Ctrl+Shift+V pastes
    const isMac = bridge.platform === "darwin";
    xterm.attachCustomKeyEventHandler((e) => {
      if (isMac) return true;
      if (e.type !== "keydown") return true;

      if (e.ctrlKey && !e.shiftKey && e.key === "c") {
        const selection = xterm.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection);
          xterm.clearSelection();
          return false; // consumed — don't send to PTY
        }
        return true; // no selection — let xterm send SIGINT
      }

      if (e.ctrlKey && e.shiftKey && e.key === "C") {
        const selection = xterm.getSelection();
        if (selection) navigator.clipboard.writeText(selection);
        return false;
      }

      if (e.ctrlKey && (e.key === "v" || e.key === "V")) {
        e.preventDefault(); // stop browser paste event (would cause double paste)
        navigator.clipboard.readText().then((text) => {
          xterm.paste(text);
        });
        return false;
      }

      return true;
    });

    // Ctrl+wheel zoom
    function handleWheel(e: WheelEvent) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -1 : 1;
      const current = xterm.options.fontSize ?? 12;
      const next = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, current + delta));
      if (next === current) return;
      dispatch({ type: "SET_FONT_SIZE", fontSize: next });
      bridge.settings.update({ fontSize: next });
    }
    el.addEventListener("wheel", handleWheel, { passive: false });

    requestAnimationFrame(() => {
      if (aborted) return;

      fitAddon.fit();
      const cols = xterm.cols;
      const rows = xterm.rows;

      bridge.terminal.open({
        projectId: terminal.projectId,
        terminalId: terminal.terminalId,
        commandId: terminal.commandId,
        branchId: terminal.branchId,
        cols,
        rows,
      });
    });

    // Bidirectional data
    const onDataDisposable = xterm.onData((data) => {
      bridge.terminal.write({ terminalId: terminal.terminalId, data });
    });

    bridge.terminal.onData(terminal.terminalId, (data) => {
      xterm.write(data);
    });

    // Status events
    bridge.terminal.onExit(terminal.terminalId, ({ exitCode }) => {
      dispatch({ type: "UPDATE_STATUS", terminalId: terminal.terminalId, status: "exited", exitCode });
    });

    bridge.terminal.onBusy(terminal.terminalId, (busy) => {
      dispatch({ type: "UPDATE_BUSY", terminalId: terminal.terminalId, busy });
    });

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      bridge.terminal.resize({
        terminalId: terminal.terminalId,
        cols: xterm.cols,
        rows: xterm.rows,
      });
    });
    resizeObserver.observe(el);

    return () => {
      aborted = true;
      el.removeEventListener("wheel", handleWheel);
      onDataDisposable.dispose();
      bridge.terminal.offData(terminal.terminalId);
      bridge.terminal.offExit(terminal.terminalId);
      bridge.terminal.offBusy(terminal.terminalId);
      resizeObserver.disconnect();
      xterm.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [terminal.key]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ backgroundColor: "#1e1e1e" }}
    />
  );
}
