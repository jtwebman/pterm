import { useState, useEffect } from "react";
import { createPortal } from "react-dom";

import type {
	Command,
	DetectedBrowser,
	DetectedShell,
	CustomTerminalTheme,
	ShellType,
} from "../../shared/types.js";
import { bridge } from "../bridge.js";
import { useApp } from "../store.js";
import { BUILTIN_THEMES } from "../themes.js";
import { ThemeEditor } from "./ThemeEditor.js";

interface Props {
	onClose: () => void;
}

type Tab = "general" | "commands";

export function SettingsDialog({ onClose }: Props) {
	const { state, dispatch } = useApp();
	const [tab, setTab] = useState<Tab>("general");
	const [detectedBrowsers, setDetectedBrowsers] = useState<DetectedBrowser[]>([]);
	const [detectedShells, setDetectedShells] = useState<DetectedShell[]>([]);
	const [themeEditorOpen, setThemeEditorOpen] = useState(false);
	const [editingTheme, setEditingTheme] = useState<CustomTerminalTheme | undefined>();
	const [commands, setCommands] = useState<Command[]>(state.defaultProjectCommands);

	useEffect(() => {
		void bridge.shell.detectBrowsers().then(setDetectedBrowsers);
		void bridge.shell.detectShells().then(setDetectedShells);
	}, []);

	function saveCommands(updated: Command[]) {
		setCommands(updated);
		dispatch({ type: "SET_DEFAULT_COMMANDS", commands: updated });
		void bridge.settings.update({ defaultProjectCommands: updated });
	}

	function updateCommand(i: number, patch: Partial<Command>) {
		const updated = [...commands];
		updated[i] = { ...commands[i], ...patch };
		saveCommands(updated);
	}

	const tabs: { id: Tab; label: string }[] = [
		{ id: "general", label: "General" },
		{ id: "commands", label: "Commands" },
	];

	return createPortal(
		<div
			className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
			onMouseDown={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div
				className="bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg shadow-xl w-full max-w-lg mx-4 flex flex-col"
				style={{ maxHeight: "85vh" }}
			>
				<div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
					<h2 className="text-lg font-semibold text-gray-900 dark:text-white">Settings</h2>
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
							{/* UI Theme */}
							<div>
								<label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
									UI Theme
								</label>
								<select
									value={state.theme}
									onChange={(e) => {
										const val = e.target.value as "system" | "dark" | "light";
										dispatch({ type: "SET_THEME", theme: val });
										void bridge.settings.update({ theme: val });
									}}
									className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
								>
									<option value="system">System (auto)</option>
									<option value="dark">Dark</option>
									<option value="light">Light</option>
								</select>
							</div>

							{/* Terminal Theme */}
							<div>
								<label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
									Terminal Theme
								</label>
								<div className="flex items-center gap-2">
									<select
										value={state.terminalTheme}
										onChange={(e) => {
											const val = e.target.value;
											dispatch({ type: "SET_TERMINAL_THEME", terminalTheme: val });
											void bridge.settings.update({ terminalTheme: val });
										}}
										className="flex-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
									>
										<option value="">Auto</option>
										<optgroup label="Built-in">
											{Object.entries(BUILTIN_THEMES).map(([id, t]) => (
												<option key={id} value={id}>
													{t.name}
												</option>
											))}
										</optgroup>
										{state.customThemes.length > 0 && (
											<optgroup label="Custom">
												{state.customThemes.map((t) => (
													<option key={t.id} value={t.id}>
														{t.name}
													</option>
												))}
											</optgroup>
										)}
									</select>
									{state.customThemes.some((t) => t.id === state.terminalTheme) && (
										<button
											onClick={() => {
												const custom = state.customThemes.find((t) => t.id === state.terminalTheme);
												if (custom) {
													setEditingTheme(custom);
													setThemeEditorOpen(true);
												}
											}}
											className="px-2 py-2 text-sm text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-200"
											title="Edit theme"
										>
											&#x270E;
										</button>
									)}
									<button
										onClick={() => {
											setEditingTheme(undefined);
											setThemeEditorOpen(true);
										}}
										className="px-2 py-2 text-sm text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-200"
										title="Create custom theme"
									>
										+
									</button>
								</div>
							</div>

							{/* Browser */}
							<div>
								<label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
									Browser
								</label>
								<select
									value={state.browserCommand}
									onChange={(e) => {
										const val = e.target.value;
										dispatch({ type: "SET_BROWSER_COMMAND", browserCommand: val });
										void bridge.settings.update({ browserCommand: val });
									}}
									className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
								>
									<option value="">System default</option>
									{detectedBrowsers.map((b) => {
										const options = [];
										options.push(
											<option key={b.command} value={`"${b.command}"`}>
												{b.name}
											</option>,
										);
										if (b.profiles) {
											for (const p of b.profiles) {
												const cmd = `"${b.command}" --profile-directory="${p.directory}"`;
												options.push(
													<option key={cmd} value={cmd}>
														{b.name} — {p.name}
													</option>,
												);
											}
										}
										return options;
									})}
								</select>
							</div>
						</div>
					)}

					{tab === "commands" && (
						<div className="space-y-3">
							<div className="flex items-center justify-between">
								<p className="text-xs text-gray-400 dark:text-gray-500">
									Default commands for all projects. Built-in commands can be toggled but not
									removed.
								</p>
								<button
									onClick={() =>
										saveCommands([
											...commands,
											{
												id: crypto.randomUUID(),
												name: "",
												command: "",
												type: "shell",
												enabled: true,
											},
										])
									}
									className="text-xs text-blue-400 hover:text-blue-300 shrink-0 ml-2"
								>
									+ Add
								</button>
							</div>
							{commands.map((cmd, i) => (
								<div
									key={cmd.id}
									className={`flex gap-2 items-center ${cmd.enabled === false ? "opacity-50" : ""}`}
								>
									{/* Toggle */}
									<button
										onClick={() => updateCommand(i, { enabled: cmd.enabled === false })}
										className={`w-4 h-4 rounded border shrink-0 ${
											cmd.enabled !== false
												? "bg-blue-500 border-blue-500"
												: "border-gray-400 dark:border-gray-600"
										}`}
										title={cmd.enabled !== false ? "Disable" : "Enable"}
									/>
									<input
										type="text"
										value={cmd.name}
										onChange={(e) => updateCommand(i, { name: e.target.value })}
										disabled={cmd.builtin && cmd.name !== ""}
										className="w-1/5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-2 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 disabled:opacity-60"
										placeholder="Name"
									/>
									<input
										type="text"
										value={cmd.command}
										onChange={(e) => updateCommand(i, { command: e.target.value })}
										className="flex-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-2 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
										placeholder="Command (empty = shell)"
									/>
									<select
										value={cmd.shell ?? "default"}
										onChange={(e) => {
											const val = e.target.value;
											updateCommand(i, {
												shell: val === "default" ? undefined : (val as ShellType),
											});
										}}
										className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-2 py-1.5 text-xs text-gray-500 dark:text-gray-400 focus:outline-none focus:border-blue-500"
									>
										{detectedShells.map((s) => (
											<option key={s.type} value={s.type}>
												{s.name}
											</option>
										))}
										{detectedShells.length === 0 && <option value="default">Default</option>}
									</select>
									{cmd.builtin ? (
										<span className="w-5" />
									) : (
										<button
											onClick={() => saveCommands(commands.filter((_, j) => j !== i))}
											className="text-gray-400 dark:text-gray-500 hover:text-red-400 px-1"
										>
											&times;
										</button>
									)}
								</div>
							))}
							{commands.length === 0 && (
								<div className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
									No commands configured
								</div>
							)}
						</div>
					)}
				</div>

				<div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 flex justify-end shrink-0">
					<button
						onClick={onClose}
						className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 rounded"
					>
						Close
					</button>
				</div>
			</div>
			{themeEditorOpen && (
				<ThemeEditor
					editingTheme={editingTheme}
					onClose={() => {
						setThemeEditorOpen(false);
						setEditingTheme(undefined);
					}}
				/>
			)}
		</div>,
		document.body,
	);
}
