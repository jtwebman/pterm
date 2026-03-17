import { useState, useEffect } from "react";
import type { Project, TerminalSession } from "../../shared/types.js";
import { bridge } from "../bridge.js";
import { useApp } from "../store.js";
import { TerminalTab } from "./TerminalTab.js";
import { CommandPicker } from "./CommandPicker.js";

interface Props {
  project: Project;
  branchId: string | null;
  name: string;
  folder: string;
  terminals: TerminalSession[];
}

export function BranchGroup({ project, branchId, name, folder, terminals }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const { state, dispatch } = useApp();
  const gitBranch = state.branchNames[folder];

  useEffect(() => {
    // Fetch initial branch name
    bridge.git.getBranch(folder).then((branch) => {
      if (branch) dispatch({ type: "SET_BRANCH_NAME", folder, branchName: branch });
    });

    // Watch .git/HEAD for changes
    bridge.git.watchBranch(folder);
    const cleanup = bridge.git.onBranchChanged((changedFolder, branch) => {
      if (changedFolder === folder) {
        dispatch({ type: "SET_BRANCH_NAME", folder, branchName: branch });
      }
    });

    return () => {
      cleanup();
      bridge.git.unwatchBranch(folder);
    };
  }, [folder, dispatch]);

  const displayName = gitBranch ? `${name} (${gitBranch})` : name;

  function handleDropEnd(e: React.DragEvent) {
    e.preventDefault();
    const draggedKey = e.dataTransfer.getData("text/plain");
    if (draggedKey) {
      dispatch({ type: "REORDER_TERMINAL", draggedKey, beforeKey: null });
    }
  }

  return (
    <div className="ml-2">
      <div className="flex items-center gap-1 px-2 py-1 group">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 w-3 text-center shrink-0 text-xs"
        >
          {collapsed ? "\u203A" : "\u2304"}
        </button>
        <span className="truncate flex-1 text-gray-600 dark:text-gray-400 text-xs font-medium">
          {displayName}
        </span>
        <CommandPicker project={project} defaultBranchId={branchId} />
      </div>
      {!collapsed && terminals.length > 0 && (
        <div className="ml-2">
          {terminals.map((t) => (
            <TerminalTab
              key={t.key}
              terminal={t}
              isActive={t.key === state.activeTerminalKey}
            />
          ))}
          <div
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
            onDrop={handleDropEnd}
            className="h-2"
          />
        </div>
      )}
    </div>
  );
}
