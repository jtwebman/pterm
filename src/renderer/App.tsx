import { useState, useCallback, useRef } from "react";
import type { Project } from "../shared/types.js";
import { AppProvider, useApp } from "./store.js";
import { bridge } from "./bridge.js";
import { Sidebar } from "./components/Sidebar.js";
import { TerminalPane } from "./components/TerminalPane.js";
import { EmptyState } from "./components/EmptyState.js";
import { ProjectConfigDialog } from "./components/ProjectConfigDialog.js";

const MIN_SIDEBAR = 150;
const MAX_SIDEBAR = 500;

function clampSidebar(v: number) {
  return Math.min(MAX_SIDEBAR, Math.max(MIN_SIDEBAR, v));
}

function AppContent() {
  const { state, dispatch } = useApp();
  const [dialogState, setDialogState] = useState<
    { mode: "create" } | { mode: "edit"; project: Project } | null
  >(null);
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; width: number } | null>(null);
  const latestWidthRef = useRef(state.sidebarWidth);
  latestWidthRef.current = state.sidebarWidth;

  const activeTerminal = state.terminals.find(
    (t) => t.key === state.activeTerminalKey
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragStartRef.current = { x: e.clientX, width: latestWidthRef.current };
      setDragging(true);

      function onMouseMove(ev: MouseEvent) {
        if (!dragStartRef.current) return;
        const delta = ev.clientX - dragStartRef.current.x;
        const next = clampSidebar(dragStartRef.current.width + delta);
        dispatch({ type: "SET_SIDEBAR_WIDTH", sidebarWidth: next });
      }

      function onMouseUp() {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        setDragging(false);
        bridge.settings.update({ sidebarWidth: latestWidthRef.current });
        dragStartRef.current = null;
      }

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [dispatch]
  );

  if (state.projects.length === 0 && !dialogState) {
    return (
      <div className="flex h-screen bg-gray-950 text-white">
        <EmptyState onCreateProject={() => setDialogState({ mode: "create" })} />
      </div>
    );
  }

  return (
    <div
      className="flex h-screen bg-gray-950 text-white"
      style={dragging ? { cursor: "col-resize", userSelect: "none" } : undefined}
    >
      <div className="shrink-0 flex" style={{ width: state.sidebarWidth }}>
        <Sidebar
          onAddProject={() => setDialogState({ mode: "create" })}
          onEditProject={(project) => setDialogState({ mode: "edit", project })}
        />
        <div
          onMouseDown={handleMouseDown}
          className="w-1 cursor-col-resize hover:bg-blue-500/50 transition-colors"
        />
      </div>
      <div className="flex-1 min-w-0">
        {activeTerminal ? (
          <TerminalPane key={activeTerminal.key} terminal={activeTerminal} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-600">
            Select or create a terminal
          </div>
        )}
      </div>
      {dialogState && (
        <ProjectConfigDialog
          project={dialogState.mode === "edit" ? dialogState.project : undefined}
          onClose={() => setDialogState(null)}
        />
      )}
    </div>
  );
}

export function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
