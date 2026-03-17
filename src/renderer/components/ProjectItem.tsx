import { useState } from "react";
import type { Project } from "../../shared/types.js";
import { useApp } from "../store.js";
import { BranchGroup } from "./BranchGroup.js";
import { CommandPicker } from "./CommandPicker.js";
import { BranchManager } from "./BranchManager.js";

interface Props {
  project: Project;
  onEdit: (project: Project) => void;
}

export function ProjectItem({ project, onEdit }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [showBranchManager, setShowBranchManager] = useState(false);
  const { state } = useApp();
  const terminals = state.terminals.filter((t) => t.projectId === project.id);

  const mainTerminals = terminals.filter((t) => !t.branchId);
  const branchGroups = project.branches.map((b) => ({
    id: b.id,
    name: b.name,
    folder: b.folder,
    terminals: terminals.filter((t) => t.branchId === b.id),
  }));

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
          className="opacity-0 group-hover:opacity-100 text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-200 w-5 h-5 flex items-center justify-center text-sm"
          title="Edit project"
        >
          &#x2699;
        </button>
        <button
          onClick={() => setShowBranchManager(true)}
          className="opacity-0 group-hover:opacity-100 text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-200 w-5 h-5 flex items-center justify-center text-sm"
          title="Manage branches"
        >
          &#x2442;
        </button>
        <CommandPicker project={project} />
      </div>
      {!collapsed && (
        <>
          <BranchGroup
            project={project}
            branchId={null}
            name={project.name}
            folder={project.folder}
            terminals={mainTerminals}
          />
          {branchGroups.map((bg) => (
            <BranchGroup
              key={bg.id}
              project={project}
              branchId={bg.id}
              name={bg.name}
              folder={bg.folder}
              terminals={bg.terminals}
            />
          ))}
        </>
      )}
      {showBranchManager && (
        <BranchManager
          project={project}
          onClose={() => setShowBranchManager(false)}
        />
      )}
    </div>
  );
}
