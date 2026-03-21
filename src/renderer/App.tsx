import { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

import type { Project } from "../shared/types.js";
import { bridge } from "./bridge.js";
import { CommandPicker } from "./components/CommandPicker.js";
import { EmptyState } from "./components/EmptyState.js";
import { ProjectConfigDialog } from "./components/ProjectConfigDialog.js";
import { Sidebar } from "./components/Sidebar.js";
import { TerminalPane } from "./components/TerminalPane.js";
import { AppProvider, useApp } from "./store.js";

const MIN_SIDEBAR = 150;
const MAX_SIDEBAR = 500;

function clampSidebar(v: number) {
	return Math.min(MAX_SIDEBAR, Math.max(MIN_SIDEBAR, v));
}

function AppContent() {
	const { state, dispatch } = useApp();
	const [dialogState, setDialogState] = useState<
		{ mode: "create" } | { mode: "edit"; project: Project } | null
	>(null);
	const [dragging, setDragging] = useState(false);
	const dragStartRef = useRef<{ x: number; width: number } | null>(null);
	const latestWidthRef = useRef(state.sidebarWidth);
	latestWidthRef.current = state.sidebarWidth;

	// CommandPicker opened via Ctrl/Cmd+T shortcut
	const [commandPickerProject, setCommandPickerProject] = useState<Project | null>(null);

	// Toggle dark class on document based on resolved theme
	useEffect(() => {
		if (state.resolvedTheme === "dark") {
			document.documentElement.classList.add("dark");
		} else {
			document.documentElement.classList.remove("dark");
		}
	}, [state.resolvedTheme]);

	// Global keyboard shortcuts
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			const isMac = bridge.platform === "darwin";
			const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

			// Ctrl/Cmd+T — open CommandPicker for active terminal's project
			if (ctrlOrCmd && !e.shiftKey && e.key === "t") {
				e.preventDefault();
				const active = state.terminals.find((t) => t.key === state.activeTerminalKey);
				if (active) {
					const project = state.projects.find((p) => p.id === active.projectId);
					if (project) {
						setCommandPickerProject(project);
						return;
					}
				}
				// If no active terminal but there are projects, use the first one
				if (state.projects.length > 0) {
					setCommandPickerProject(state.projects[0]);
				}
				return;
			}

			// Ctrl+Tab / Ctrl+Shift+Tab — cycle terminals
			if (e.ctrlKey && e.key === "Tab") {
				e.preventDefault();
				if (state.terminals.length === 0) return;
				const currentIdx = state.terminals.findIndex((t) => t.key === state.activeTerminalKey);
				let nextIdx: number;
				if (e.shiftKey) {
					nextIdx = currentIdx <= 0 ? state.terminals.length - 1 : currentIdx - 1;
				} else {
					nextIdx = currentIdx >= state.terminals.length - 1 ? 0 : currentIdx + 1;
				}
				dispatch({ type: "SET_ACTIVE", key: state.terminals[nextIdx].key });
				return;
			}
		}

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [state.terminals, state.activeTerminalKey, state.projects, dispatch]);

	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			dragStartRef.current = { x: e.clientX, width: latestWidthRef.current };
			setDragging(true);

			function onMouseMove(ev: MouseEvent) {
				if (!dragStartRef.current) return;
				const delta = ev.clientX - dragStartRef.current.x;
				const next = clampSidebar(dragStartRef.current.width + delta);
				dispatch({ type: "SET_SIDEBAR_WIDTH", sidebarWidth: next });
			}

			function onMouseUp() {
				document.removeEventListener("mousemove", onMouseMove);
				document.removeEventListener("mouseup", onMouseUp);
				setDragging(false);
				void bridge.settings.update({ sidebarWidth: latestWidthRef.current });
				dragStartRef.current = null;
			}

			document.addEventListener("mousemove", onMouseMove);
			document.addEventListener("mouseup", onMouseUp);
		},
		[dispatch],
	);

	if (state.projects.length === 0 && !dialogState) {
		return (
			<div className="flex h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-white">
				<EmptyState onCreateProject={() => setDialogState({ mode: "create" })} />
			</div>
		);
	}

	return (
		<div
			className="flex h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-white"
			style={dragging ? { cursor: "col-resize", userSelect: "none" } : undefined}
		>
			<div className="shrink-0 flex" style={{ width: state.sidebarWidth }}>
				<Sidebar
					onAddProject={() => setDialogState({ mode: "create" })}
					onEditProject={(project) => setDialogState({ mode: "edit", project })}
				/>
				<div
					onMouseDown={handleMouseDown}
					className="w-1 cursor-col-resize hover:bg-blue-500/50 transition-colors"
				/>
			</div>
			<div className="flex-1 min-w-0 relative">
				{state.terminals.map((t) => (
					<TerminalPane key={t.key} terminal={t} isVisible={t.key === state.activeTerminalKey} />
				))}
				{state.terminals.length === 0 && (
					<div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-600">
						Select or create a terminal
					</div>
				)}
			</div>
			{dialogState && (
				<ProjectConfigDialog
					project={dialogState.mode === "edit" ? dialogState.project : undefined}
					onClose={() => setDialogState(null)}
				/>
			)}
			{commandPickerProject &&
				createPortal(
					<CommandPicker
						project={commandPickerProject}
						asModal
						onClose={() => setCommandPickerProject(null)}
					/>,
					document.body,
				)}
		</div>
	);
}

export function App() {
	return (
		<AppProvider>
			<AppContent />
		</AppProvider>
	);
}
