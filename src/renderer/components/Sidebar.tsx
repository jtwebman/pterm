import { useRef, useEffect } from "react";
import type { Project } from "../../shared/types.js";
import { bridge } from "../bridge.js";
import { useApp } from "../store.js";
import { ProjectItem } from "./ProjectItem.js";

const MIN_FONT_SIZE = 6;
const MAX_FONT_SIZE = 32;

interface Props {
  onAddProject: () => void;
  onEditProject: (project: Project) => void;
}

export function Sidebar({ onAddProject, onEditProject }: Props) {
  const { state, dispatch } = useApp();
  const ref = useRef<HTMLDivElement>(null);

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

  return (
    <div
      ref={ref}
      className="flex flex-col h-full bg-gray-900 flex-1 min-w-0"
      style={{ fontSize: state.fontSize }}
    >
      <div className="flex items-center justify-between px-3 py-3 border-b border-gray-800">
        <span className="font-semibold text-gray-300">Projects</span>
        <button
          onClick={onAddProject}
          className="text-gray-500 hover:text-gray-200"
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
    </div>
  );
}
