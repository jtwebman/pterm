import { useState } from "react";
import type { Project } from "../../shared/types.js";
import { useApp } from "../store.js";
import { TerminalTab } from "./TerminalTab.js";
import { CommandPicker } from "./CommandPicker.js";

interface Props {
  project: Project;
  onEdit: (project: Project) => void;
}

export function ProjectItem({ project, onEdit }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const { state, dispatch } = useApp();
  const terminals = state.terminals.filter((t) => t.projectId === project.id);

  function handleDropEnd(e: React.DragEvent) {
    e.preventDefault();
    const draggedKey = e.dataTransfer.getData("text/plain");
    if (draggedKey) {
      dispatch({ type: "REORDER_TERMINAL", draggedKey, beforeKey: null });
    }
  }

  return (
    <div className="mb-1">
      <div className="flex items-center gap-1 px-2 py-1.5 group">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 w-4 text-center shrink-0"
        >
          {collapsed ? "\u203A" : "\u2304"}
        </button>
        <span className="truncate flex-1 text-gray-800 dark:text-gray-200 font-medium">{project.name}</span>
        <button
          onClick={() => onEdit(project)}
          className="opacity-0 group-hover:opacity-100 text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-200"
          title="Edit project"
        >
          &#x2699;
        </button>
        <CommandPicker project={project} />
      </div>
      {!collapsed && terminals.length > 0 && (
        <div className="ml-4">
          {terminals.map((t) => (
            <TerminalTab
              key={t.key}
              terminal={t}
              isActive={t.key === state.activeTerminalKey}
            />
          ))}
          {/* Drop zone at end of list */}
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
