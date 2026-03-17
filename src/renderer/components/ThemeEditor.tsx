import { useState } from "react";
import { createPortal } from "react-dom";
import type { CustomTerminalTheme } from "../../shared/types.js";
import { bridge } from "../bridge.js";
import { useApp } from "../store.js";
import { BUILTIN_THEMES } from "../themes.js";

interface Props {
  editingTheme?: CustomTerminalTheme;
  onClose: () => void;
}

type ColorKey = keyof CustomTerminalTheme["colors"];

const COLOR_FIELDS: { key: ColorKey; label: string }[] = [
  { key: "background", label: "Background" },
  { key: "foreground", label: "Foreground" },
  { key: "cursor", label: "Cursor" },
  { key: "cursorAccent", label: "Cursor Accent" },
  { key: "selectionBackground", label: "Selection BG" },
  { key: "selectionForeground", label: "Selection FG" },
  { key: "black", label: "Black" },
  { key: "red", label: "Red" },
  { key: "green", label: "Green" },
  { key: "yellow", label: "Yellow" },
  { key: "blue", label: "Blue" },
  { key: "magenta", label: "Magenta" },
  { key: "cyan", label: "Cyan" },
  { key: "white", label: "White" },
  { key: "brightBlack", label: "Bright Black" },
  { key: "brightRed", label: "Bright Red" },
  { key: "brightGreen", label: "Bright Green" },
  { key: "brightYellow", label: "Bright Yellow" },
  { key: "brightBlue", label: "Bright Blue" },
  { key: "brightMagenta", label: "Bright Magenta" },
  { key: "brightCyan", label: "Bright Cyan" },
  { key: "brightWhite", label: "Bright White" },
];

const DEFAULT_COLORS: CustomTerminalTheme["colors"] = {
  background: "#1e1e1e",
  foreground: "#d4d4d4",
  cursor: "#d4d4d4",
  cursorAccent: "#1e1e1e",
  selectionBackground: "#264f78",
  selectionForeground: "#ffffff",
  black: "#1e1e1e",
  red: "#f44747",
  green: "#6a9955",
  yellow: "#d7ba7d",
  blue: "#569cd6",
  magenta: "#c586c0",
  cyan: "#4ec9b0",
  white: "#d4d4d4",
  brightBlack: "#808080",
  brightRed: "#f44747",
  brightGreen: "#6a9955",
  brightYellow: "#d7ba7d",
  brightBlue: "#569cd6",
  brightMagenta: "#c586c0",
  brightCyan: "#4ec9b0",
  brightWhite: "#ffffff",
};

function colorsFromBuiltin(id: string): CustomTerminalTheme["colors"] {
  const t = BUILTIN_THEMES[id]?.theme;
  if (!t) return { ...DEFAULT_COLORS };
  const c: any = {};
  for (const f of COLOR_FIELDS) {
    c[f.key] = (t as any)[f.key] ?? DEFAULT_COLORS[f.key];
  }
  return c as CustomTerminalTheme["colors"];
}

export function ThemeEditor({ editingTheme, onClose }: Props) {
  const { state, dispatch } = useApp();
  const isEdit = !!editingTheme;

  const [name, setName] = useState(editingTheme?.name ?? "");
  const [variant, setVariant] = useState<"dark" | "light">(editingTheme?.variant ?? "dark");
  const [colors, setColors] = useState<CustomTerminalTheme["colors"]>(
    editingTheme?.colors ?? { ...DEFAULT_COLORS }
  );

  function setColor(key: ColorKey, value: string) {
    setColors((prev) => ({ ...prev, [key]: value }));
  }

  function handleBaseTheme(id: string) {
    if (!id) return;
    setColors(colorsFromBuiltin(id));
    const builtin = BUILTIN_THEMES[id];
    if (builtin) setVariant(builtin.variant);
  }

  function handleSave() {
    if (!name.trim()) return;

    const theme: CustomTerminalTheme = {
      id: editingTheme?.id ?? crypto.randomUUID(),
      name: name.trim(),
      variant,
      colors,
    };

    let updated: CustomTerminalTheme[];
    if (isEdit) {
      updated = state.customThemes.map((t) => (t.id === theme.id ? theme : t));
    } else {
      updated = [...state.customThemes, theme];
    }

    dispatch({ type: "SET_CUSTOM_THEMES", customThemes: updated });
    bridge.settings.update({ customThemes: updated });
    onClose();
  }

  function handleDelete() {
    if (!editingTheme) return;
    const updated = state.customThemes.filter((t) => t.id !== editingTheme.id);
    dispatch({ type: "SET_CUSTOM_THEMES", customThemes: updated });
    bridge.settings.update({ customThemes: updated });
    onClose();
  }

  // Preview: sample terminal output
  const previewLines = [
    { text: "~/project", color: colors.blue },
    { text: " $ ", color: colors.foreground },
    { text: "git status", color: colors.green },
    { text: "\nOn branch ", color: colors.foreground },
    { text: "main", color: colors.cyan },
    { text: "\nModified: ", color: colors.yellow },
    { text: "src/app.ts", color: colors.foreground },
    { text: "\nError: ", color: colors.red },
    { text: "missing import", color: colors.foreground },
  ];

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg shadow-xl w-full max-w-xl mx-4 max-h-[85vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            {isEdit ? "Edit Theme" : "New Theme"}
          </h3>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Name + variant */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Theme"
                className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-3 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Variant</label>
              <select
                value={variant}
                onChange={(e) => setVariant(e.target.value as "dark" | "light")}
                className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-3 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </div>
          </div>

          {/* Base theme starter */}
          {!isEdit && (
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Start from</label>
              <select
                onChange={(e) => handleBaseTheme(e.target.value)}
                defaultValue=""
                className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-3 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
              >
                <option value="">— Select a base theme —</option>
                {Object.entries(BUILTIN_THEMES).map(([id, t]) => (
                  <option key={id} value={id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Preview */}
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Preview</label>
            <div
              className="rounded p-3 font-mono text-sm leading-relaxed"
              style={{ backgroundColor: colors.background, color: colors.foreground }}
            >
              {previewLines.map((seg, i) => (
                <span key={i} style={{ color: seg.color, whiteSpace: "pre" }}>{seg.text}</span>
              ))}
              <span
                className="inline-block w-2 h-4 align-middle ml-px animate-pulse"
                style={{ backgroundColor: colors.cursor }}
              />
            </div>
          </div>

          {/* Color grid */}
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-2">Colors</label>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {COLOR_FIELDS.map((f) => (
                <label key={f.key} className="flex items-center gap-2">
                  <input
                    type="color"
                    value={colors[f.key]}
                    onChange={(e) => setColor(f.key, e.target.value)}
                    className="w-6 h-6 rounded border border-gray-300 dark:border-gray-600 cursor-pointer bg-transparent p-0"
                  />
                  <span className="text-xs text-gray-600 dark:text-gray-400 flex-1">{f.label}</span>
                  <input
                    type="text"
                    value={colors[f.key]}
                    onChange={(e) => setColor(f.key, e.target.value)}
                    className="w-20 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-1.5 py-0.5 text-xs text-gray-900 dark:text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-800 flex justify-between">
          <div>
            {isEdit && (
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded"
              >
                Delete
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
              disabled={!name.trim()}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded"
            >
              {isEdit ? "Save" : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
