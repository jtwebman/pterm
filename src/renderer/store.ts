import {
	createContext,
	useContext,
	useReducer,
	useEffect,
	type Dispatch,
	type ReactNode,
} from "react";
import { createElement } from "react";

import type { Project, TerminalSession, Activity, CustomTerminalTheme } from "../shared/types.js";
import { makeTerminalKey } from "../shared/types.js";
import { bridge } from "./bridge.js";

// State

export interface AppState {
	projects: Project[];
	terminals: TerminalSession[];
	activeTerminalKey: string | null;
	fontSize: number;
	sidebarWidth: number;
	theme: "system" | "dark" | "light";
	terminalTheme: string;
	browserCommand: string;
	resolvedTheme: "dark" | "light";
	customThemes: CustomTerminalTheme[];
	branchNames: Record<string, string>;
	pendingBranches: { projectId: string; name: string }[];
}

const initialState: AppState = {
	projects: [],
	terminals: [],
	activeTerminalKey: null,
	fontSize: 12,
	sidebarWidth: 250,
	theme: "system",
	terminalTheme: "",
	browserCommand: "",
	resolvedTheme: "dark",
	customThemes: [],
	branchNames: {},
	pendingBranches: [],
};

// Actions

export type AppAction =
	| { type: "SET_PROJECTS"; projects: Project[] }
	| { type: "ADD_PROJECT"; project: Project }
	| { type: "UPDATE_PROJECT"; project: Project }
	| { type: "DELETE_PROJECT"; projectId: string }
	| { type: "ADD_TERMINAL"; terminal: TerminalSession }
	| { type: "SET_TERMINALS"; terminals: TerminalSession[] }
	| { type: "REMOVE_TERMINAL"; key: string }
	| { type: "SET_ACTIVE"; key: string | null }
	| { type: "UPDATE_STATUS"; terminalId: string; status: "running" | "exited"; exitCode?: number }
	| { type: "UPDATE_ACTIVITY"; terminalId: string; activity: Activity; activityText: string }
	| { type: "SET_FONT_SIZE"; fontSize: number }
	| { type: "SET_SIDEBAR_WIDTH"; sidebarWidth: number }
	| { type: "SET_THEME"; theme: "system" | "dark" | "light" }
	| { type: "SET_TERMINAL_THEME"; terminalTheme: string }
	| { type: "SET_BROWSER_COMMAND"; browserCommand: string }
	| { type: "SET_CUSTOM_THEMES"; customThemes: CustomTerminalTheme[] }
	| { type: "SET_RESOLVED_THEME"; resolvedTheme: "dark" | "light" }
	| { type: "REORDER_TERMINAL"; draggedKey: string; beforeKey: string | null }
	| { type: "SET_BRANCH_NAME"; folder: string; branchName: string }
	| { type: "ADD_PENDING_BRANCH"; projectId: string; name: string }
	| { type: "REMOVE_PENDING_BRANCH"; projectId: string; name: string };

function reducer(state: AppState, action: AppAction): AppState {
	switch (action.type) {
		case "SET_PROJECTS":
			return { ...state, projects: action.projects };
		case "ADD_PROJECT":
			return { ...state, projects: [...state.projects, action.project] };
		case "UPDATE_PROJECT":
			return {
				...state,
				projects: state.projects.map((p) => (p.id === action.project.id ? action.project : p)),
			};
		case "DELETE_PROJECT":
			return {
				...state,
				projects: state.projects.filter((p) => p.id !== action.projectId),
				terminals: state.terminals.filter((t) => t.projectId !== action.projectId),
				activeTerminalKey:
					state.terminals.find((t) => t.key === state.activeTerminalKey)?.projectId ===
					action.projectId
						? null
						: state.activeTerminalKey,
			};
		case "ADD_TERMINAL":
			return { ...state, terminals: [...state.terminals, action.terminal] };
		case "SET_TERMINALS":
			return { ...state, terminals: action.terminals };
		case "REMOVE_TERMINAL": {
			const remaining = state.terminals.filter((t) => t.key !== action.key);
			return {
				...state,
				terminals: remaining,
				activeTerminalKey:
					state.activeTerminalKey === action.key
						? remaining.length > 0
							? remaining[remaining.length - 1].key
							: null
						: state.activeTerminalKey,
			};
		}
		case "SET_ACTIVE":
			return { ...state, activeTerminalKey: action.key };
		case "UPDATE_STATUS":
			return {
				...state,
				terminals: state.terminals.map((t) =>
					t.terminalId === action.terminalId
						? { ...t, status: action.status, exitCode: action.exitCode }
						: t,
				),
			};
		case "UPDATE_ACTIVITY":
			return {
				...state,
				terminals: state.terminals.map((t) =>
					t.terminalId === action.terminalId
						? { ...t, activity: action.activity, activityText: action.activityText }
						: t,
				),
			};
		case "SET_FONT_SIZE":
			return { ...state, fontSize: action.fontSize };
		case "SET_SIDEBAR_WIDTH":
			return { ...state, sidebarWidth: action.sidebarWidth };
		case "SET_THEME":
			return { ...state, theme: action.theme };
		case "SET_TERMINAL_THEME":
			return { ...state, terminalTheme: action.terminalTheme };
		case "SET_BROWSER_COMMAND":
			return { ...state, browserCommand: action.browserCommand };
		case "SET_CUSTOM_THEMES":
			return { ...state, customThemes: action.customThemes };
		case "SET_RESOLVED_THEME":
			return { ...state, resolvedTheme: action.resolvedTheme };
		case "REORDER_TERMINAL": {
			const dragged = state.terminals.find((t) => t.key === action.draggedKey);
			if (!dragged) return state;
			const without = state.terminals.filter((t) => t.key !== action.draggedKey);
			if (action.beforeKey === null) {
				let insertIdx = without.length;
				for (let i = without.length - 1; i >= 0; i--) {
					if (without[i].projectId === dragged.projectId) {
						insertIdx = i + 1;
						break;
					}
				}
				const result = [...without];
				result.splice(insertIdx, 0, dragged);
				return { ...state, terminals: result };
			}
			const beforeIdx = without.findIndex((t) => t.key === action.beforeKey);
			if (beforeIdx === -1) return state;
			const beforeTerminal = without[beforeIdx];
			if (beforeTerminal.projectId !== dragged.projectId) return state;
			const result = [...without];
			result.splice(beforeIdx, 0, dragged);
			return { ...state, terminals: result };
		}
		case "SET_BRANCH_NAME":
			return {
				...state,
				branchNames: { ...state.branchNames, [action.folder]: action.branchName },
			};
		case "ADD_PENDING_BRANCH":
			return {
				...state,
				pendingBranches: [
					...state.pendingBranches,
					{ projectId: action.projectId, name: action.name },
				],
			};
		case "REMOVE_PENDING_BRANCH":
			return {
				...state,
				pendingBranches: state.pendingBranches.filter(
					(b) => !(b.projectId === action.projectId && b.name === action.name),
				),
			};
		default:
			return state;
	}
}

// Context

const AppContext = createContext<{ state: AppState; dispatch: Dispatch<AppAction> } | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
	const [state, dispatch] = useReducer(reducer, initialState);

	useEffect(() => {
		async function init() {
			try {
				const projects = await bridge.project.list();
				dispatch({ type: "SET_PROJECTS", projects });

				const projectIds = new Set(projects.map((p) => p.id));
				const saved = await bridge.terminal.getSavedSessions();
				if (saved.length) {
					const terminals = saved
						.filter((s) => projectIds.has(s.projectId))
						.map((s) => ({
							key: makeTerminalKey(s.projectId, s.terminalId),
							terminalId: s.terminalId,
							projectId: s.projectId,
							commandId: s.commandId,
							branchId: s.branchId,
							commandName: s.commandName,
							commandType: s.commandType,
							status: s.status as "running" | "exited",
							exitCode: s.exitCode,
							activity: "idle" as const,
							activityText: "",
							restored: true,
							aiSessionId: s.aiSessionId,
						}));
					if (terminals.length) {
						// Restore saved order
						const savedOrder = await bridge.terminal.getOrder();
						if (savedOrder) {
							const orderMap = new Map(savedOrder.map((key, i) => [key, i]));
							terminals.sort((a, b) => {
								const ai = orderMap.get(a.key) ?? Infinity;
								const bi = orderMap.get(b.key) ?? Infinity;
								return ai - bi;
							});
						}
						dispatch({ type: "SET_TERMINALS", terminals });
						const savedKey = await bridge.terminal.getActiveKey();
						const validKey = terminals.find((t) => t.key === savedKey)?.key ?? terminals[0].key;
						dispatch({ type: "SET_ACTIVE", key: validKey });
					}
				}

				const settings = await bridge.settings.get();
				dispatch({ type: "SET_FONT_SIZE", fontSize: settings.fontSize });
				dispatch({ type: "SET_SIDEBAR_WIDTH", sidebarWidth: settings.sidebarWidth });
				dispatch({ type: "SET_THEME", theme: settings.theme });
				if (settings.terminalTheme) {
					dispatch({ type: "SET_TERMINAL_THEME", terminalTheme: settings.terminalTheme });
				}
				if (settings.browserCommand) {
					dispatch({ type: "SET_BROWSER_COMMAND", browserCommand: settings.browserCommand });
				}
				if (settings.customThemes?.length) {
					dispatch({ type: "SET_CUSTOM_THEMES", customThemes: settings.customThemes });
				}

				const isDark = await bridge.theme.getNative();
				dispatch({ type: "SET_RESOLVED_THEME", resolvedTheme: isDark ? "dark" : "light" });
			} catch (err) {
				console.error("Failed to initialize app state:", err);
			}
		}
		void init();

		const cleanup = bridge.theme.onNativeChanged((isDark) => {
			dispatch({ type: "SET_RESOLVED_THEME", resolvedTheme: isDark ? "dark" : "light" });
		});
		return cleanup;
	}, []);

	// Persist active tab to DB so it survives restart
	useEffect(() => {
		if (state.activeTerminalKey) {
			void bridge.terminal.setActiveKey(state.activeTerminalKey);
		}
	}, [state.activeTerminalKey]);

	// Persist terminal order so it survives restart
	useEffect(() => {
		if (state.terminals.length > 0) {
			void bridge.terminal.setOrder(state.terminals.map((t) => t.key));
		}
	}, [state.terminals]);

	useEffect(() => {
		if (state.theme === "dark") {
			dispatch({ type: "SET_RESOLVED_THEME", resolvedTheme: "dark" });
		} else if (state.theme === "light") {
			dispatch({ type: "SET_RESOLVED_THEME", resolvedTheme: "light" });
		} else {
			void bridge.theme.getNative().then((isDark) => {
				dispatch({ type: "SET_RESOLVED_THEME", resolvedTheme: isDark ? "dark" : "light" });
			});
		}
	}, [state.theme]);

	return createElement(AppContext.Provider, { value: { state, dispatch } }, children);
}

export function useApp() {
	const ctx = useContext(AppContext);
	if (!ctx) throw new Error("useApp must be used within AppProvider");
	return ctx;
}
