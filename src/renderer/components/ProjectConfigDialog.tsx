import { useState, useEffect } from "react";
import type { Project, Command, DetectedBrowser, DirEntry } from "../../shared/types.js";
import { bridge } from "../bridge.js";
import { useApp } from "../store.js";
import { BUILTIN_THEMES } from "../themes.js";

interface Props {
  project?: Project; // undefined = create mode
  onClose: () => void;
}

type Tab = "general" | "commands" | "worktree";

export function ProjectConfigDialog({ project, onClose }: Props) {
  const { state, dispatch } = useApp();
  const isEdit = !!project;
  const [tab, setTab] = useState<Tab>("general");

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
  const [terminalTheme, setTerminalTheme] = useState(project?.terminalTheme ?? "");
  const [browserCommand, setBrowserCommand] = useState(project?.browserCommand ?? "");
  const [wslDistros, setWslDistros] = useState<string[]>([]);
  const [detectedBrowsers, setDetectedBrowsers] = useState<DetectedBrowser[]>([]);
  const [fileBrowserOpen, setFileBrowserOpen] = useState(false);

  useEffect(() => {
    bridge.shell.detectBrowsers().then(setDetectedBrowsers);
  }, []);

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
        terminalTheme: terminalTheme || undefined,
        browserCommand: browserCommand || undefined,
      });
      dispatch({ type: "UPDATE_PROJECT", project: updated });
    } else {
      const created = await bridge.project.create({
        name,
        folder,
        envVars: envObj,
        commands,
        worktreeCopyFiles: filteredCopyFiles,
        terminalTheme: terminalTheme || undefined,
        browserCommand: browserCommand || undefined,
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

  function addEnvVar() { setEnvVars([...envVars, ["", ""]]); }
  function updateEnvVar(index: number, key: string, value: string) {
    const updated = [...envVars];
    updated[index] = [key, value];
    setEnvVars(updated);
  }
  function removeEnvVar(index: number) { setEnvVars(envVars.filter((_, i) => i !== index)); }

  function addCommand() {
    setCommands([...commands, { id: crypto.randomUUID(), name: "", command: "", type: "shell" as const }]);
  }
  function updateCommand(index: number, field: keyof Command, value: string) {
    const updated = [...commands];
    updated[index] = { ...updated[index], [field]: value };
    setCommands(updated);
  }
  function removeCommand(index: number) { setCommands(commands.filter((_, i) => i !== index)); }

  function handleTreeSelect(relativePath: string) {
    if (!worktreeCopyFiles.includes(relativePath)) {
      setWorktreeCopyFiles([...worktreeCopyFiles, relativePath]);
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "general", label: "General" },
    { id: "commands", label: "Commands" },
    { id: "worktree", label: "Worktree" },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg shadow-xl w-full max-w-lg mx-4 flex flex-col" style={{ maxHeight: "85vh" }}>
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isEdit ? "Edit Project" : "New Project"}
          </h2>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-800 px-6">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm border-b-2 -mb-px ${
                tab === t.id
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          {tab === "general" && (
            <div className="space-y-4">
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

              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Terminal Theme</label>
                <select
                  value={terminalTheme}
                  onChange={(e) => setTerminalTheme(e.target.value)}
                  className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="">Default</option>
                  <optgroup label="Built-in">
                    {Object.entries(BUILTIN_THEMES).map(([id, t]) => (
                      <option key={id} value={id}>{t.name}</option>
                    ))}
                  </optgroup>
                  {state.customThemes.length > 0 && (
                    <optgroup label="Custom">
                      {state.customThemes.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Browser</label>
                <select
                  value={browserCommand}
                  onChange={(e) => setBrowserCommand(e.target.value)}
                  className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="">Default (use global setting)</option>
                  <option value="system">System default (xdg-open)</option>
                  {detectedBrowsers.map((b) => {
                    const options = [];
                    options.push(
                      <option key={b.command} value={`"${b.command}"`}>
                        {b.name}
                      </option>
                    );
                    if (b.profiles) {
                      for (const p of b.profiles) {
                        const cmd = `"${b.command}" --profile-directory="${p.directory}"`;
                        options.push(
                          <option key={cmd} value={cmd}>
                            {b.name} — {p.name}
                          </option>
                        );
                      }
                    }
                    return options;
                  })}
                </select>
              </div>

              {/* Env Vars */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm text-gray-500 dark:text-gray-400">Environment Variables</label>
                  <button onClick={addEnvVar} className="text-xs text-blue-400 hover:text-blue-300">+ Add</button>
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
                    <button onClick={() => removeEnvVar(i)} className="text-gray-400 dark:text-gray-500 hover:text-red-400 px-1">&times;</button>
                  </div>
                ))}
              </div>

              {wslDistros.length > 0 && (
                <div>
                  <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">WSL Distros Available</label>
                  <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                    {wslDistros.map((d) => (
                      <div key={d} className="px-2 py-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded">{d}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "commands" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Define commands that can launch as terminals. Empty command = interactive shell.
                </p>
                <button onClick={addCommand} className="text-xs text-blue-400 hover:text-blue-300 shrink-0 ml-2">+ Add</button>
              </div>
              {commands.map((cmd, i) => (
                <div key={cmd.id} className="flex gap-2">
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
                  <button onClick={() => removeCommand(i)} className="text-gray-400 dark:text-gray-500 hover:text-red-400 px-1">&times;</button>
                </div>
              ))}
              {commands.length === 0 && (
                <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">No commands configured</div>
              )}
            </div>
          )}

          {tab === "worktree" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Files, folders, or glob patterns to copy into new worktrees.
                </p>
                <div className="flex gap-2 shrink-0 ml-2">
                  {folder.trim() && (
                    <button onClick={() => setFileBrowserOpen(!fileBrowserOpen)} className="text-xs text-blue-400 hover:text-blue-300">
                      Browse
                    </button>
                  )}
                  <button onClick={() => setWorktreeCopyFiles([...worktreeCopyFiles, ""])} className="text-xs text-blue-400 hover:text-blue-300">
                    + Add
                  </button>
                </div>
              </div>
              {worktreeCopyFiles.map((pattern, i) => (
                <div key={i} className="flex gap-2">
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
              {fileBrowserOpen && folder.trim() && (
                <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded overflow-hidden">
                  <div className="flex items-center justify-between px-2 py-1.5 bg-gray-50 dark:bg-gray-750 border-b border-gray-200 dark:border-gray-700">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Select files & folders</span>
                    <button
                      onClick={() => setFileBrowserOpen(false)}
                      className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-200 shrink-0 ml-2"
                    >
                      &times;
                    </button>
                  </div>
                  <div className="max-h-64 overflow-y-auto py-1">
                    <FileTree
                      rootFolder={folder}
                      parentPath=""
                      selectedPaths={worktreeCopyFiles}
                      onSelect={handleTreeSelect}
                    />
                  </div>
                </div>
              )}
              {worktreeCopyFiles.length === 0 && !fileBrowserOpen && (
                <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">No copy files configured</div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 flex justify-between shrink-0">
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

// Tree view components for file browser

function FileTree({
  rootFolder,
  parentPath,
  selectedPaths,
  onSelect,
}: {
  rootFolder: string;
  parentPath: string;
  selectedPaths: string[];
  onSelect: (path: string) => void;
}) {
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const fullPath = parentPath ? `${rootFolder}/${parentPath}` : rootFolder;
    bridge.shell.listDir(fullPath, rootFolder).then((result) => {
      setEntries(result);
      setLoaded(true);
    });
  }, [rootFolder, parentPath]);

  if (!loaded) {
    return <div className="px-2 py-1 text-xs text-gray-400 dark:text-gray-500">Loading...</div>;
  }

  if (entries.length === 0) {
    return <div className="px-2 py-1 text-xs text-gray-400 dark:text-gray-500 italic">Empty</div>;
  }

  return (
    <>
      {entries.map((entry) => (
        <FileTreeNode
          key={entry.name}
          entry={entry}
          rootFolder={rootFolder}
          parentPath={parentPath}
          selectedPaths={selectedPaths}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

function FileTreeNode({
  entry,
  rootFolder,
  parentPath,
  selectedPaths,
  onSelect,
}: {
  entry: DirEntry;
  rootFolder: string;
  parentPath: string;
  selectedPaths: string[];
  onSelect: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const relativePath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
  const alreadyAdded = selectedPaths.includes(relativePath);
  const depth = parentPath ? parentPath.split("/").length : 0;
  const tracked = entry.gitIgnored === false;

  function handleClick() {
    if (!alreadyAdded && !tracked) {
      onSelect(relativePath);
    }
  }

  function handleDoubleClick() {
    if (entry.isDirectory) {
      setExpanded(!expanded);
    }
  }

  function handleToggle(e: React.MouseEvent) {
    e.stopPropagation();
    setExpanded(!expanded);
  }

  const dimmed = alreadyAdded || tracked;
  const title = alreadyAdded
    ? "Already added"
    : tracked
      ? "Already in worktree (tracked by git)"
      : `Click to add ${relativePath}`;

  return (
    <>
      <div
        className={`flex items-center gap-1 py-0.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 select-none ${dimmed ? "opacity-40" : "cursor-pointer"}`}
        style={{ paddingLeft: `${depth * 16 + 8}px`, paddingRight: "8px" }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        title={title}
      >
        {entry.isDirectory ? (
          <button
            onClick={handleToggle}
            className="shrink-0 w-4 text-center text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            {expanded ? "\u25BE" : "\u25B8"}
          </button>
        ) : (
          <span className="shrink-0 w-4" />
        )}
        <span className="shrink-0 text-gray-400 dark:text-gray-500">
          {entry.isDirectory ? (expanded ? "\u{1F4C2}" : "\u{1F4C1}") : "\u{1F4C4}"}
        </span>
        <span className={`flex-1 truncate ${dimmed ? "text-gray-400 dark:text-gray-500" : "text-gray-700 dark:text-gray-300"}`}>
          {entry.name}
        </span>
      </div>
      {entry.isDirectory && expanded && (
        <FileTree
          rootFolder={rootFolder}
          parentPath={relativePath}
          selectedPaths={selectedPaths}
          onSelect={onSelect}
        />
      )}
    </>
  );
}
