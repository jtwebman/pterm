import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import "@xterm/xterm/css/xterm.css";
import { bridge } from "../bridge.js";
import { useApp } from "../store.js";
import { SearchBar } from "./SearchBar.js";
import { DARK_THEME, LIGHT_THEME } from "../themes.js";
import type { TerminalSession } from "../../shared/types.js";

const MIN_FONT_SIZE = 6;
const MAX_FONT_SIZE = 32;

interface Props {
  terminal: TerminalSession;
  isVisible: boolean;
}

export function TerminalPane({ terminal, isVisible }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { state, dispatch } = useApp();
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const fontSizeRef = useRef(state.fontSize);
  fontSizeRef.current = state.fontSize;
  const [error, setError] = useState<string | null>(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const searchVisibleRef = useRef(false);
  searchVisibleRef.current = searchVisible;
  const searchQueryRef = useRef("");

  const xtermTheme = state.resolvedTheme === "dark" ? DARK_THEME : LIGHT_THEME;

  // Sync font size changes into a live terminal
  useEffect(() => {
    const xterm = xtermRef.current;
    const fitAddon = fitAddonRef.current;
    if (!xterm || !fitAddon) return;
    xterm.options.fontSize = state.fontSize;
    if (isVisible) {
      fitAddon.fit();
      bridge.terminal.resize({
        terminalId: terminal.terminalId,
        cols: xterm.cols,
        rows: xterm.rows,
      });
    }
  }, [state.fontSize]);

  // Sync theme changes into a live terminal
  useEffect(() => {
    const xterm = xtermRef.current;
    if (!xterm) return;
    xterm.options.theme = xtermTheme;
  }, [state.resolvedTheme]);

  // Re-fit and focus when becoming visible (tab switch)
  useEffect(() => {
    if (!isVisible) return;
    const fitAddon = fitAddonRef.current;
    const xterm = xtermRef.current;
    if (!fitAddon || !xterm) return;
    // Use rAF to ensure the container has layout dimensions
    requestAnimationFrame(() => {
      fitAddon.fit();
      bridge.terminal.resize({
        terminalId: terminal.terminalId,
        cols: xterm.cols,
        rows: xterm.rows,
      });
      xterm.focus();
    });
  }, [isVisible]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let aborted = false;

    const xterm = new Terminal({
      cursorBlink: true,
      fontSize: fontSizeRef.current,
      fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', Menlo, Monaco, 'Courier New', monospace",
      scrollback: 100_000,
      theme: xtermTheme,
    });
    xtermRef.current = xterm;

    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    xterm.loadAddon(fitAddon);

    // Clickable URLs
    const webLinksAddon = new WebLinksAddon((_event, url) => {
      bridge.shell.openExternal(url);
    });
    xterm.loadAddon(webLinksAddon);

    // Search
    const searchAddon = new SearchAddon();
    searchAddonRef.current = searchAddon;
    xterm.loadAddon(searchAddon);

    xterm.open(el);

    // Copy/paste + shortcut keybindings
    const isMac = bridge.platform === "darwin";
    xterm.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown") return true;

      const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

      // Ctrl/Cmd+F — open search
      if (ctrlOrCmd && !e.shiftKey && e.key === "f") {
        setSearchVisible(true);
        return false;
      }

      // Escape — close search if open
      if (e.key === "Escape" && searchVisibleRef.current) {
        setSearchVisible(false);
        searchAddon.clearDecorations();
        return false;
      }

      // Ctrl/Cmd+T — bubble to document handler for CommandPicker
      if (ctrlOrCmd && !e.shiftKey && e.key === "t") {
        return false;
      }

      // Ctrl+Tab / Ctrl+Shift+Tab — bubble to document handler for terminal cycling
      if (e.ctrlKey && e.key === "Tab") {
        return false;
      }

      // Mac: let browser handle native copy/paste
      if (isMac) return true;

      // Windows/Linux copy/paste
      if (e.ctrlKey && !e.shiftKey && e.key === "c") {
        const selection = xterm.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection);
          xterm.clearSelection();
          return false;
        }
        return true; // no selection — let xterm send SIGINT
      }

      if (e.ctrlKey && e.shiftKey && e.key === "C") {
        const selection = xterm.getSelection();
        if (selection) navigator.clipboard.writeText(selection);
        return false;
      }

      if (e.ctrlKey && (e.key === "v" || e.key === "V")) {
        e.preventDefault();
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

    requestAnimationFrame(async () => {
      if (aborted) return;

      fitAddon.fit();
      const cols = xterm.cols;
      const rows = xterm.rows;

      if (terminal.restored) {
        try {
          const { scrollback, respawned } = await bridge.terminal.restore({
            terminalId: terminal.terminalId,
            cols,
            rows,
          });
          // Replay saved scrollback (empty for TUI commands like claude/codex)
          for (const chunk of scrollback) {
            const binary = atob(chunk);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            xterm.write(bytes);
          }
          // If a new PTY was spawned, reset terminal state so the new shell's
          // readline doesn't inherit stale cursor position from replayed scrollback
          if (respawned) {
            // Soft reset (DECSTR) — clears modes/margins without clearing screen
            xterm.write("\x1b[!p");
            // Move cursor to a fresh line
            xterm.write("\r\n");
            dispatch({ type: "UPDATE_STATUS", terminalId: terminal.terminalId, status: "running" });
          }
          // Data from the respawned PTY arrives via the normal onData listener
        } catch (err) {
          setError(String(err));
        }
      } else {
        try {
          await bridge.terminal.open({
            projectId: terminal.projectId,
            terminalId: terminal.terminalId,
            commandId: terminal.commandId,
            branchId: terminal.branchId,
            cols,
            rows,
          });
        } catch (err) {
          setError(String(err));
        }
      }

      xterm.focus();
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

    bridge.terminal.onActivity(terminal.terminalId, ({ activity, activityText }) => {
      dispatch({ type: "UPDATE_ACTIVITY", terminalId: terminal.terminalId, activity: activity as any, activityText });
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
      bridge.terminal.offActivity(terminal.terminalId);
      resizeObserver.disconnect();
      xterm.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
  }, [terminal.key]);

  function handleSearchClose() {
    setSearchVisible(false);
    searchAddonRef.current?.clearDecorations();
    xtermRef.current?.focus();
  }

  return (
    <div
      className="relative w-full h-full"
      style={{
        backgroundColor: xtermTheme.background,
        display: isVisible ? "block" : "none",
      }}
    >
      {searchVisible && (
        <SearchBar
          onSearch={(query) => {
            searchQueryRef.current = query;
            if (query) {
              searchAddonRef.current?.findNext(query, { incremental: true });
            } else {
              searchAddonRef.current?.clearDecorations();
            }
          }}
          onNext={() => {
            if (searchQueryRef.current) searchAddonRef.current?.findNext(searchQueryRef.current);
          }}
          onPrevious={() => {
            if (searchQueryRef.current) searchAddonRef.current?.findPrevious(searchQueryRef.current);
          }}
          onClose={handleSearchClose}
        />
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-950/80 z-10 p-8">
          <div className="text-center">
            <div className="text-red-400 font-medium mb-2">Terminal failed to start</div>
            <div className="text-red-300/70 text-sm font-mono break-all">{error}</div>
          </div>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
