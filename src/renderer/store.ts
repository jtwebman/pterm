import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  type Dispatch,
  type ReactNode,
} from "react";
import { createElement } from "react";
import type { Project, TerminalSession } from "../shared/types.js";
import { bridge } from "./bridge.js";

// State

export interface AppState {
  projects: Project[];
  terminals: TerminalSession[];
  activeTerminalKey: string | null;
  fontSize: number;
  sidebarWidth: number;
}

const initialState: AppState = {
  projects: [],
  terminals: [],
  activeTerminalKey: null,
  fontSize: 12,
  sidebarWidth: 250,
};

// Actions

export type AppAction =
  | { type: "SET_PROJECTS"; projects: Project[] }
  | { type: "ADD_PROJECT"; project: Project }
  | { type: "UPDATE_PROJECT"; project: Project }
  | { type: "DELETE_PROJECT"; projectId: string }
  | { type: "ADD_TERMINAL"; terminal: TerminalSession }
  | { type: "REMOVE_TERMINAL"; key: string }
  | { type: "SET_ACTIVE"; key: string | null }
  | { type: "UPDATE_STATUS"; terminalId: string; status: "running" | "exited"; exitCode?: number }
  | { type: "UPDATE_BUSY"; terminalId: string; busy: boolean }
  | { type: "SET_FONT_SIZE"; fontSize: number }
  | { type: "SET_SIDEBAR_WIDTH"; sidebarWidth: number };

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_PROJECTS":
      return { ...state, projects: action.projects };
    case "ADD_PROJECT":
      return { ...state, projects: [...state.projects, action.project] };
    case "UPDATE_PROJECT":
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === action.project.id ? action.project : p
        ),
      };
    case "DELETE_PROJECT":
      return {
        ...state,
        projects: state.projects.filter((p) => p.id !== action.projectId),
        terminals: state.terminals.filter((t) => t.projectId !== action.projectId),
        activeTerminalKey:
          state.terminals.find((t) => t.key === state.activeTerminalKey)?.projectId === action.projectId
            ? null
            : state.activeTerminalKey,
      };
    case "ADD_TERMINAL":
      return { ...state, terminals: [...state.terminals, action.terminal] };
    case "REMOVE_TERMINAL": {
      const remaining = state.terminals.filter((t) => t.key !== action.key);
      return {
        ...state,
        terminals: remaining,
        activeTerminalKey:
          state.activeTerminalKey === action.key
            ? (remaining.length > 0 ? remaining[remaining.length - 1].key : null)
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
            : t
        ),
      };
    case "UPDATE_BUSY":
      return {
        ...state,
        terminals: state.terminals.map((t) =>
          t.terminalId === action.terminalId ? { ...t, busy: action.busy } : t
        ),
      };
    case "SET_FONT_SIZE":
      return { ...state, fontSize: action.fontSize };
    case "SET_SIDEBAR_WIDTH":
      return { ...state, sidebarWidth: action.sidebarWidth };
    default:
      return state;
  }
}

// Context

const AppContext = createContext<{ state: AppState; dispatch: Dispatch<AppAction> } | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    bridge.project.list().then((projects) => {
      dispatch({ type: "SET_PROJECTS", projects });
    });
    bridge.settings.get().then((settings) => {
      dispatch({ type: "SET_FONT_SIZE", fontSize: settings.fontSize });
      dispatch({ type: "SET_SIDEBAR_WIDTH", sidebarWidth: settings.sidebarWidth });
    });
  }, []);

  return createElement(AppContext.Provider, { value: { state, dispatch } }, children);
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
