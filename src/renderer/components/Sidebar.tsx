import { useRef, useEffect, useState } from "react";
import type { Project, CustomTerminalTheme } from "../../shared/types.js";
import { bridge } from "../bridge.js";
import { useApp } from "../store.js";
import { ProjectItem } from "./ProjectItem.js";
import { BUILTIN_THEMES } from "../themes.js";
import { ThemeEditor } from "./ThemeEditor.js";
import iconSvg from "../assets/icon.svg";

const MIN_FONT_SIZE = 6;
const MAX_FONT_SIZE = 32;

interface Props {
  onAddProject: () => void;
  onEditProject: (project: Project) => void;
}

export function Sidebar({ onAddProject, onEditProject }: Props) {
  const { state, dispatch } = useApp();
  const ref = useRef<HTMLDivElement>(null);
  const [themeEditorOpen, setThemeEditorOpen] = useState(false);
  const [editingTheme, setEditingTheme] = useState<CustomTerminalTheme | undefined>();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    function handleWheel(e: WheelEvent) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -1 : 1;
      const next = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, state.fontSize + delta));
      if (next === state.fontSize) return;
      dispatch({ type: "SET_FONT_SIZE", fontSize: next });
      bridge.settings.update({ fontSize: next });
    }
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [state.fontSize, dispatch]);

  function handleThemeCycle() {
    const order: Array<"system" | "dark" | "light"> = ["system", "dark", "light"];
    const idx = order.indexOf(state.theme);
    const next = order[(idx + 1) % order.length];
    dispatch({ type: "SET_THEME", theme: next });
    bridge.settings.update({ theme: next });
  }

  function handleEditCustomTheme(themeId: string) {
    const custom = state.customThemes.find((t) => t.id === themeId);
    if (custom) {
      setEditingTheme(custom);
      setThemeEditorOpen(true);
    }
  }

  const themeLabel = state.theme === "system" ? "Auto" : state.theme === "dark" ? "Dark" : "Light";

  return (
    <div
      ref={ref}
      className="flex flex-col h-full bg-gray-100 dark:bg-gray-900 flex-1 min-w-0"
      style={{ fontSize: state.fontSize }}
    >
      <div className="flex items-center justify-between px-3 py-3 border-b border-gray-200 dark:border-gray-800">
        <span className="font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
          <img src={iconSvg} alt="" className="w-5 h-5" />
          pterm
        </span>
        <button
          onClick={onAddProject}
          className="text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-200"
          title="Add project"
        >
          + Add
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {state.projects.map((p) => (
          <ProjectItem key={p.id} project={p} onEdit={onEditProject} />
        ))}
      </div>
      <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-800 space-y-1">
        <button
          onClick={handleThemeCycle}
          className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-200"
          title="Toggle UI theme"
        >
          UI: {themeLabel}
        </button>
        <div className="flex items-center gap-1">
          <select
            value={state.terminalTheme}
            onChange={(e) => {
              const val = e.target.value;
              if (val === "__edit__") {
                // Find the custom theme being "edited" — open editor for it
                return;
              }
              dispatch({ type: "SET_TERMINAL_THEME", terminalTheme: val });
              bridge.settings.update({ terminalTheme: val });
            }}
            className="text-xs bg-transparent text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-200 cursor-pointer border-none outline-none flex-1 min-w-0"
            title="Default terminal theme"
          >
            <option value="">Terminal: Auto</option>
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
          {/* Edit button for custom themes */}
          {state.customThemes.some((t) => t.id === state.terminalTheme) && (
            <button
              onClick={() => handleEditCustomTheme(state.terminalTheme)}
              className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-200 shrink-0"
              title="Edit theme"
            >
              &#x270E;
            </button>
          )}
          <button
            onClick={() => { setEditingTheme(undefined); setThemeEditorOpen(true); }}
            className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-200 shrink-0"
            title="Create custom theme"
          >
            +
          </button>
        </div>
      </div>
      {themeEditorOpen && (
        <ThemeEditor
          editingTheme={editingTheme}
          onClose={() => { setThemeEditorOpen(false); setEditingTheme(undefined); }}
        />
      )}
    </div>
  );
}
