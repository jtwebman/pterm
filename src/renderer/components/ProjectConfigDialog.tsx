import { useState } from "react";
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
    project?.commands ?? [{ id: crypto.randomUUID(), name: "Shell", command: "" }]
  );

  async function handlePickFolder() {
    const picked = await bridge.dialog.pickFolder();
    if (picked) setFolder(picked);
  }

  async function handleSave() {
    const envObj: Record<string, string> = {};
    for (const [k, v] of envVars) {
      if (k.trim()) envObj[k.trim()] = v;
    }

    if (isEdit && project) {
      const updated = await bridge.project.update({
        id: project.id,
        name,
        folder,
        envVars: envObj,
        commands,
      });
      dispatch({ type: "UPDATE_PROJECT", project: updated });
    } else {
      const created = await bridge.project.create({
        name,
        folder,
        envVars: envObj,
        commands,
      });
      dispatch({ type: "ADD_PROJECT", project: created });
    }
    onClose();
  }

  async function handleDelete() {
    if (!project) return;
    // Close all terminals for this project
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
    setCommands([...commands, { id: crypto.randomUUID(), name: "", command: "" }]);
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
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">
            {isEdit ? "Edit Project" : "New Project"}
          </h2>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              placeholder="My Project"
            />
          </div>

          {/* Folder */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Folder</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                placeholder="/path/to/project"
              />
              <button
                onClick={handlePickFolder}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-sm text-gray-300 rounded"
              >
                Browse
              </button>
            </div>
          </div>

          {/* Env Vars */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm text-gray-400">Environment Variables</label>
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
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                  placeholder="KEY"
                />
                <input
                  type="text"
                  value={value}
                  onChange={(e) => updateEnvVar(i, key, e.target.value)}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                  placeholder="value"
                />
                <button
                  onClick={() => removeEnvVar(i)}
                  className="text-gray-500 hover:text-red-400 px-1"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {/* Commands */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm text-gray-400">Commands</label>
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
                  className="w-1/3 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                  placeholder="Name"
                />
                <input
                  type="text"
                  value={cmd.command}
                  onChange={(e) => updateCommand(i, "command", e.target.value)}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                  placeholder="Command (empty = shell)"
                />
                <button
                  onClick={() => removeCommand(i)}
                  className="text-gray-500 hover:text-red-400 px-1"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-800 flex justify-between">
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
              className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 rounded"
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
