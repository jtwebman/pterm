import { useState } from "react";
import { createPortal } from "react-dom";
import type { Project } from "../../shared/types.js";
import { makeTerminalKey } from "../../shared/types.js";
import { bridge } from "../bridge.js";
import { useApp } from "../store.js";

interface Props {
  project: Project;
  asModal?: boolean;
  onClose?: () => void;
}

export function CommandPicker({ project, asModal, onClose }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedCommandId, setSelectedCommandId] = useState<string>(
    project.commands[0]?.id ?? ""
  );
  const [branchMode, setBranchMode] = useState<"main" | "new">("main");
  const [newBranchName, setNewBranchName] = useState("");
  const { dispatch } = useApp();

  const isOpen = asModal || open;

  function reset() {
    setSelectedCommandId(project.commands[0]?.id ?? "");
    setBranchMode("main");
    setNewBranchName("");
    if (asModal) {
      onClose?.();
    } else {
      setOpen(false);
    }
  }

  async function handleLaunch() {
    const command = project.commands.find((c) => c.id === selectedCommandId);
    if (!command) return;

    let branchId: string | undefined;

    if (branchMode === "new" && newBranchName.trim()) {
      const branch = await bridge.branch.create({
        projectId: project.id,
        name: newBranchName.trim(),
      });
      branchId = branch.id;
    }

    const terminalId = crypto.randomUUID();
    const key = makeTerminalKey(project.id, terminalId);
    const label = branchId
      ? `${command.name || "Shell"} (${newBranchName.trim()})`
      : command.name || "Shell";

    dispatch({
      type: "ADD_TERMINAL",
      terminal: {
        key,
        projectId: project.id,
        terminalId,
        commandId: command.id,
        branchId,
        commandName: label,
        commandType: command.type,
        status: "running",
        activity: "idle",
        activityText: "",
      },
    });
    dispatch({ type: "SET_ACTIVE", key });
    reset();
  }

  const dialogContent = (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) reset();
      }}
    >
      <div className="bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg shadow-xl w-full max-w-sm mx-4">
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            New Terminal — {project.name}
          </h3>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Command */}
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">Command</label>
            {project.commands.length === 0 ? (
              <div className="text-sm text-gray-400 dark:text-gray-500">No commands configured</div>
            ) : (
              <div className="space-y-1">
                {project.commands.map((cmd) => (
                  <button
                    key={cmd.id}
                    onClick={() => setSelectedCommandId(cmd.id)}
                    className={`block w-full text-left px-3 py-2 text-sm rounded ${
                      selectedCommandId === cmd.id
                        ? "bg-blue-600/30 text-blue-700 dark:text-blue-300 border border-blue-500/50"
                        : "text-gray-700 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5 border border-transparent"
                    }`}
                  >
                    <span className="font-medium">{cmd.name || "Shell"}</span>
                    {cmd.command && (
                      <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">{cmd.command}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Working directory / branch */}
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">
              Working Directory
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="branch"
                  checked={branchMode === "main"}
                  onChange={() => setBranchMode("main")}
                  className="accent-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Project folder
                  <span className="text-xs text-gray-400 dark:text-gray-500 ml-1.5">{project.folder}</span>
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="branch"
                  checked={branchMode === "new"}
                  onChange={() => setBranchMode("new")}
                  className="accent-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">New branch</span>
              </label>
              {branchMode === "new" && (
                <input
                  type="text"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  placeholder="Branch name"
                  autoFocus
                  className="w-full ml-6 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-3 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleLaunch();
                  }}
                />
              )}
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-800 flex justify-end gap-2">
          <button
            onClick={reset}
            className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 rounded"
          >
            Cancel
          </button>
          <button
            onClick={handleLaunch}
            disabled={
              !selectedCommandId ||
              (branchMode === "new" && !newBranchName.trim())
            }
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded"
          >
            Launch
          </button>
        </div>
      </div>
    </div>
  );

  if (asModal) {
    return dialogContent;
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-200 px-1"
        title="New terminal"
      >
        +
      </button>
      {isOpen && createPortal(dialogContent, document.body)}
    </>
  );
}
