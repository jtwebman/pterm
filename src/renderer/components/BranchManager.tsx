import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { Project } from "../../shared/types.js";
import { bridge } from "../bridge.js";
import { useApp } from "../store.js";

interface Props {
  project: Project;
  onClose: () => void;
}

function BranchAutocomplete({
  value,
  onChange,
  onSubmit,
  placeholder,
  branches,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder: string;
  branches: string[];
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = value.trim()
    ? branches.filter((b) => b.toLowerCase().includes(value.toLowerCase()))
    : branches;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!showSuggestions || filtered.length === 0) {
      if (e.key === "Enter") onSubmit();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIdx >= 0 && selectedIdx < filtered.length) {
        onChange(filtered[selectedIdx]);
        setShowSuggestions(false);
        setSelectedIdx(-1);
      } else {
        onSubmit();
      }
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  }

  return (
    <div className="relative flex-1">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setShowSuggestions(true);
          setSelectedIdx(-1);
        }}
        onFocus={() => setShowSuggestions(true)}
        onBlur={() => {
          // Delay to allow click on suggestion
          setTimeout(() => setShowSuggestions(false), 150);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-3 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
      />
      {showSuggestions && filtered.length > 0 && (
        <div className="absolute z-10 left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded shadow-lg max-h-40 overflow-y-auto">
          {filtered.map((b, i) => (
            <button
              key={b}
              onMouseDown={() => {
                onChange(b);
                setShowSuggestions(false);
              }}
              className={`block w-full text-left px-3 py-1.5 text-sm truncate ${
                i === selectedIdx
                  ? "bg-blue-600/20 text-blue-700 dark:text-blue-300"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function BranchManager({ project, onClose }: Props) {
  const { state, dispatch } = useApp();
  const [checkoutInput, setCheckoutInput] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [newBranchError, setNewBranchError] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [gitBranches, setGitBranches] = useState<string[]>([]);

  const mainBranch = state.branchNames[project.folder];

  useEffect(() => {
    bridge.git.listBranches(project.folder).then((branches) => {
      // Deduplicate
      setGitBranches([...new Set(branches)]);
    });
  }, [project.folder]);

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

  async function handleCreateBranch() {
    const name = newBranchName.trim();
    if (!name) return;
    setNewBranchError("");
    setCreating(true);
    try {
      await bridge.branch.create({ projectId: project.id, name });
      // Refresh project in store so the new branch appears in the sidebar
      const projects = await bridge.project.list();
      const updated = projects.find((p) => p.id === project.id);
      if (updated) dispatch({ type: "UPDATE_PROJECT", project: updated });
      setNewBranchName("");
      // Refresh git branches list
      const branches = await bridge.git.listBranches(project.folder);
      setGitBranches([...new Set(branches)]);
    } catch (err: any) {
      setNewBranchError(err.message || "Failed to create branch");
    } finally {
      setCreating(false);
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
              <BranchAutocomplete
                value={checkoutInput}
                onChange={setCheckoutInput}
                onSubmit={handleCheckout}
                placeholder="Switch branch..."
                branches={gitBranches}
              />
              <button
                onClick={handleCheckout}
                disabled={!checkoutInput.trim()}
                className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded shrink-0"
              >
                Switch
              </button>
            </div>
            {checkoutError && (
              <div className="text-xs text-red-500 mt-1">{checkoutError}</div>
            )}
          </div>

          {/* New worktree branch */}
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">New worktree branch</div>
            <div className="flex items-center gap-2">
              <BranchAutocomplete
                value={newBranchName}
                onChange={setNewBranchName}
                onSubmit={handleCreateBranch}
                placeholder="Branch name..."
                branches={gitBranches}
              />
              <button
                onClick={handleCreateBranch}
                disabled={!newBranchName.trim() || creating}
                className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded shrink-0"
              >
                Create
              </button>
            </div>
            {newBranchError && (
              <div className="text-xs text-red-500 mt-1">{newBranchError}</div>
            )}
          </div>

          {/* Worktree branches */}
          {project.branches.length > 0 && (
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Worktree branches</div>
              <div className="space-y-2">
                {project.branches.map((b) => (
                  <WorktreeBranchRow
                    key={b.id}
                    branch={b}
                    project={project}
                    gitBranches={gitBranches}
                    currentBranch={state.branchNames[b.folder]}
                    deleting={deleting === b.id}
                    onDelete={() => handleDelete(b.id)}
                    onCheckout={async (folder, branchName) => {
                      await bridge.git.checkout(folder, branchName);
                      dispatch({ type: "SET_BRANCH_NAME", folder, branchName });
                    }}
                  />
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

function WorktreeBranchRow({
  branch,
  project,
  gitBranches,
  currentBranch,
  deleting,
  onDelete,
  onCheckout,
}: {
  branch: { id: string; name: string; folder: string };
  project: Project;
  gitBranches: string[];
  currentBranch?: string;
  deleting: boolean;
  onDelete: () => void;
  onCheckout: (folder: string, branch: string) => Promise<void>;
}) {
  const [switchInput, setSwitchInput] = useState("");
  const [switchError, setSwitchError] = useState("");
  const [switching, setSwitching] = useState(false);

  async function handleSwitch() {
    const name = switchInput.trim();
    if (!name) return;
    setSwitchError("");
    setSwitching(true);
    try {
      await onCheckout(branch.folder, name);
      setSwitchInput("");
    } catch (err: any) {
      setSwitchError(err.message || "Checkout failed");
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="px-2 py-1.5 rounded hover:bg-black/5 dark:hover:bg-white/5">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 truncate">
          {branch.name}
        </span>
        <span className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[120px]">
          {currentBranch ?? ""}
        </span>
        <button
          onClick={onDelete}
          disabled={deleting}
          className="text-gray-400 dark:text-gray-500 hover:text-red-500 disabled:opacity-50 shrink-0"
          title="Delete branch"
        >
          &times;
        </button>
      </div>
      <div className="flex items-center gap-2 mt-1.5">
        <BranchAutocomplete
          value={switchInput}
          onChange={setSwitchInput}
          onSubmit={handleSwitch}
          placeholder="Switch branch..."
          branches={gitBranches}
        />
        <button
          onClick={handleSwitch}
          disabled={!switchInput.trim() || switching}
          className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded shrink-0"
        >
          Switch
        </button>
      </div>
      {switchError && (
        <div className="text-xs text-red-500 mt-1">{switchError}</div>
      )}
    </div>
  );
}
