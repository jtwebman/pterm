import { useState, useEffect } from "react";
import { createPortal } from "react-dom";

import type { DetectedBrowser, CustomTerminalTheme } from "../../shared/types.js";
import { bridge } from "../bridge.js";
import { useApp } from "../store.js";
import { BUILTIN_THEMES } from "../themes.js";
import { ThemeEditor } from "./ThemeEditor.js";

interface Props {
	onClose: () => void;
}

export function SettingsDialog({ onClose }: Props) {
	const { state, dispatch } = useApp();
	const [detectedBrowsers, setDetectedBrowsers] = useState<DetectedBrowser[]>([]);
	const [themeEditorOpen, setThemeEditorOpen] = useState(false);
	const [editingTheme, setEditingTheme] = useState<CustomTerminalTheme | undefined>();

	useEffect(() => {
		void bridge.shell.detectBrowsers().then(setDetectedBrowsers);
	}, []);

	const _themeLabel =
		state.theme === "system" ? "System (auto)" : state.theme === "dark" ? "Dark" : "Light";

	return createPortal(
		<div
			className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
			onMouseDown={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div className="bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg shadow-xl w-full max-w-md mx-4">
				<div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
					<h2 className="text-lg font-semibold text-gray-900 dark:text-white">Settings</h2>
				</div>

				<div className="px-6 py-4 space-y-4">
					{/* UI Theme */}
					<div>
						<label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">UI Theme</label>
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
						<label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Browser</label>
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

				<div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 flex justify-end">
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
