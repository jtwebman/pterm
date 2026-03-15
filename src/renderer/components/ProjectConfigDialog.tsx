import { useState, useEffect } from "react";
import type { Project, Command } from "../../shared/types.js";
import { bridge } from "../bridge.js";
import { useApp } from "../store.js";

interface Props {
  project?: Project; // undefined = create mode
  onClose: () => void;
}

export function ProjectConfigDialog({ project, onClose }: Props) {
  const { state, dispatch } = useApp();
  const isEdit = !!project;

  const [name, setName] = useState(project?.name ?? "");
  const [folder, setFolder] = useState(project?.folder ?? "");
  const [envVars, setEnvVars] = useState<[string, string][]>(
    project ? Object.entries(project.envVars) : []
  );
  const [commands, setCommands] = useState<Command[]>(
    project?.commands ?? [{ id: crypto.randomUUID(), name: "Shell", command: "", type: "shell" as const }]
  );
  const [worktreeCopyFiles, setWorktreeCopyFiles] = useState<string[]>(
    project?.worktreeCopyFiles ?? [".env", ".env.local"]
  );
  const [wslDistros, setWslDistros] = useState<string[]>([]);

  // Detect available commands when creating a new project
  useEffect(() => {
    if (isEdit) return;
    bridge.shell.detectCommands().then((detected) => {
      if (detected.length > 0) {
        setCommands(detected.map((d) => ({
          id: crypto.randomUUID(),
          name: d.name,
          command: d.command,
          type: d.type,
        })));
      }
    });
  }, [isEdit]);

  // Detect WSL distros on Windows
  useEffect(() => {
    if (bridge.platform !== "win32") return;
    bridge.shell.detectWsl().then(setWslDistros);
  }, []);

  async function handlePickFolder() {
    const picked = await bridge.dialog.pickFolder();
    if (picked) setFolder(picked);
  }

  async function handleSave() {
    const envObj: Record<string, string> = {};
    for (const [k, v] of envVars) {
      if (k.trim()) envObj[k.trim()] = v;
    }

    const filteredCopyFiles = worktreeCopyFiles.filter((f) => f.trim());

    if (isEdit && project) {
      const updated = await bridge.project.update({
        id: project.id,
        name,
        folder,
        envVars: envObj,
        commands,
        worktreeCopyFiles: filteredCopyFiles,
      });
      dispatch({ type: "UPDATE_PROJECT", project: updated });
    } else {
      const created = await bridge.project.create({
        name,
        folder,
        envVars: envObj,
        commands,
        worktreeCopyFiles: filteredCopyFiles,
      });
      dispatch({ type: "ADD_PROJECT", project: created });
    }
    onClose();
  }

  async function handleDelete() {
    if (!project) return;
    const projectTerminals = state.terminals.filter((t) => t.projectId === project.id);
    for (const t of projectTerminals) {
      bridge.terminal.close({ terminalId: t.terminalId });
    }
    await bridge.project.delete(project.id);
    dispatch({ type: "DELETE_PROJECT", projectId: project.id });
    onClose();
  }

  function addEnvVar() {
    setEnvVars([...envVars, ["", ""]]);
  }

  function updateEnvVar(index: number, key: string, value: string) {
    const updated = [...envVars];
    updated[index] = [key, value];
    setEnvVars(updated);
  }

  function removeEnvVar(index: number) {
    setEnvVars(envVars.filter((_, i) => i !== index));
  }

  function addCommand() {
    setCommands([...commands, { id: crypto.randomUUID(), name: "", command: "", type: "shell" as const }]);
  }

  function updateCommand(index: number, field: keyof Command, value: string) {
    const updated = [...commands];
    updated[index] = { ...updated[index], [field]: value };
    setCommands(updated);
  }

  function removeCommand(index: number) {
    setCommands(commands.filter((_, i) => i !== index));
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isEdit ? "Edit Project" : "New Project"}
          </h2>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
              placeholder="My Project"
            />
          </div>

          {/* Folder */}
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Folder</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                className="flex-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                placeholder="/path/to/project"
              />
              <button
                onClick={handlePickFolder}
                className="px-3 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-sm text-gray-700 dark:text-gray-300 rounded"
              >
                Browse
              </button>
            </div>
          </div>

          {/* Env Vars */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm text-gray-500 dark:text-gray-400">Environment Variables</label>
              <button onClick={addEnvVar} className="text-xs text-blue-400 hover:text-blue-300">
                + Add
              </button>
            </div>
            {envVars.map(([key, value], i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={key}
                  onChange={(e) => updateEnvVar(i, e.target.value, value)}
                  className="flex-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-2 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                  placeholder="KEY"
                />
                <input
                  type="text"
                  value={value}
                  onChange={(e) => updateEnvVar(i, key, e.target.value)}
                  className="flex-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-2 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                  placeholder="value"
                />
                <button
                  onClick={() => removeEnvVar(i)}
                  className="text-gray-400 dark:text-gray-500 hover:text-red-400 px-1"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>

          {/* Commands */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm text-gray-500 dark:text-gray-400">Commands</label>
              <button onClick={addCommand} className="text-xs text-blue-400 hover:text-blue-300">
                + Add
              </button>
            </div>
            {commands.map((cmd, i) => (
              <div key={cmd.id} className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={cmd.name}
                  onChange={(e) => updateCommand(i, "name", e.target.value)}
                  className="w-1/3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-2 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                  placeholder="Name"
                />
                <input
                  type="text"
                  value={cmd.command}
                  onChange={(e) => updateCommand(i, "command", e.target.value)}
                  className="flex-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-2 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                  placeholder="Command (empty = shell)"
                />
                <button
                  onClick={() => removeCommand(i)}
                  className="text-gray-400 dark:text-gray-500 hover:text-red-400 px-1"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>

          {/* Worktree Copy Files */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm text-gray-500 dark:text-gray-400">Worktree Copy Files</label>
              <button onClick={() => setWorktreeCopyFiles([...worktreeCopyFiles, ""])} className="text-xs text-blue-400 hover:text-blue-300">
                + Add
              </button>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
              Glob patterns of files to copy into new worktrees (e.g. .env, .env.*)
            </p>
            {worktreeCopyFiles.map((pattern, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={pattern}
                  onChange={(e) => {
                    const updated = [...worktreeCopyFiles];
                    updated[i] = e.target.value;
                    setWorktreeCopyFiles(updated);
                  }}
                  className="flex-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-2 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                  placeholder=".env"
                />
                <button
                  onClick={() => setWorktreeCopyFiles(worktreeCopyFiles.filter((_, j) => j !== i))}
                  className="text-gray-400 dark:text-gray-500 hover:text-red-400 px-1"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>

          {/* WSL Distros (Windows only) */}
          {wslDistros.length > 0 && (
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
                WSL Distros Available
              </label>
              <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                {wslDistros.map((d) => (
                  <div key={d} className="px-2 py-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded">
                    {d}
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Use shell type "wsl" in commands to launch in a WSL distro.
              </p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 flex justify-between">
          <div>
            {isEdit && (
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded"
              >
                Delete Project
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 rounded"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!name.trim() || !folder.trim()}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded"
            >
              {isEdit ? "Save" : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
