import { useState } from "react";
import { createPortal } from "react-dom";
import type { Project } from "../../shared/types.js";
import { bridge } from "../bridge.js";
import { useApp } from "../store.js";

interface Props {
  project: Project;
  onClose: () => void;
}

export function BranchManager({ project, onClose }: Props) {
  const { state, dispatch } = useApp();
  const [checkoutInput, setCheckoutInput] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  const mainBranch = state.branchNames[project.folder];

  async function handleCheckout() {
    const branch = checkoutInput.trim();
    if (!branch) return;
    setCheckoutError("");
    try {
      await bridge.git.checkout(project.folder, branch);
      dispatch({ type: "SET_BRANCH_NAME", folder: project.folder, branchName: branch });
      setCheckoutInput("");
    } catch (err: any) {
      setCheckoutError(err.message || "Checkout failed");
    }
  }

  async function handleDelete(branchId: string) {
    const branch = project.branches.find((b) => b.id === branchId);
    if (!branch) return;

    const branchTerminals = state.terminals.filter(
      (t) => t.projectId === project.id && t.branchId === branchId
    );

    if (branchTerminals.length > 0) {
      const confirmed = window.confirm(
        `Branch "${branch.name}" has ${branchTerminals.length} open terminal(s). Delete anyway?`
      );
      if (!confirmed) return;
    }

    setDeleting(branchId);
    try {
      // Close terminals in this branch
      for (const t of branchTerminals) {
        await bridge.terminal.close({ terminalId: t.terminalId });
        dispatch({ type: "REMOVE_TERMINAL", key: t.key });
      }

      await bridge.branch.delete({ projectId: project.id, branchId });

      // Refresh project to get updated branches list
      const projects = await bridge.project.list();
      const updated = projects.find((p) => p.id === project.id);
      if (updated) dispatch({ type: "UPDATE_PROJECT", project: updated });
    } catch (err: any) {
      window.alert(`Failed to delete branch: ${err.message}`);
    } finally {
      setDeleting(null);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg shadow-xl w-full max-w-sm mx-4">
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Branches — {project.name}
          </h3>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Main folder */}
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Main folder</div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 truncate">
                {mainBranch ?? "not a git repo"}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="text"
                value={checkoutInput}
                onChange={(e) => setCheckoutInput(e.target.value)}
                placeholder="Switch branch..."
                className="flex-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-3 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                onKeyDown={(e) => { if (e.key === "Enter") handleCheckout(); }}
              />
              <button
                onClick={handleCheckout}
                disabled={!checkoutInput.trim()}
                className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded"
              >
                Switch
              </button>
            </div>
            {checkoutError && (
              <div className="text-xs text-red-500 mt-1">{checkoutError}</div>
            )}
          </div>

          {/* Worktree branches */}
          {project.branches.length > 0 && (
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Worktree branches</div>
              <div className="space-y-1">
                {project.branches.map((b) => (
                  <div key={b.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-black/5 dark:hover:bg-white/5">
                    <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 truncate">
                      {b.name}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[120px]">
                      {state.branchNames[b.folder] ?? ""}
                    </span>
                    <button
                      onClick={() => handleDelete(b.id)}
                      disabled={deleting === b.id}
                      className="text-gray-400 dark:text-gray-500 hover:text-red-500 disabled:opacity-50 shrink-0"
                      title="Delete branch"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 rounded"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
