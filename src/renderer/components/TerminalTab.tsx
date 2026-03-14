import type { TerminalSession } from "../../shared/types.js";
import { bridge } from "../bridge.js";
import { useApp } from "../store.js";

interface Props {
  terminal: TerminalSession;
  isActive: boolean;
}

export function TerminalTab({ terminal, isActive }: Props) {
  const { dispatch } = useApp();

  const dotColor =
    terminal.status === "exited"
      ? "bg-gray-500"
      : terminal.busy
        ? "bg-yellow-400"
        : "bg-green-500";

  function handleClick() {
    dispatch({ type: "SET_ACTIVE", key: terminal.key });
  }

  function handleClose(e: React.MouseEvent) {
    e.stopPropagation();
    bridge.terminal.close({ terminalId: terminal.terminalId });
    dispatch({ type: "REMOVE_TERMINAL", key: terminal.key });
  }

  return (
    <div
      onClick={handleClick}
      className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer rounded group ${
        isActive ? "bg-white/10 text-white" : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
      }`}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
      <span className="truncate flex-1">{terminal.commandName}</span>
      <button
        onClick={handleClose}
        className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-gray-200 shrink-0"
      >
        ×
      </button>
    </div>
  );
}
