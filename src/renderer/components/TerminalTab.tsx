import { useRef } from "react";

import type { TerminalSession } from "../../shared/types.js";
import { bridge } from "../bridge.js";
import { useApp } from "../store.js";

interface Props {
	terminal: TerminalSession;
	isActive: boolean;
}

const DOT_COLORS: Record<string, string> = {
	working: "bg-green-500",
	busy: "bg-green-500",
	waiting: "bg-yellow-400",
	idle: "bg-gray-500",
};

export function TerminalTab({ terminal, isActive }: Props) {
	const { dispatch } = useApp();
	const dragRef = useRef<HTMLDivElement>(null);

	const dotColor =
		terminal.status === "exited" ? "bg-gray-500" : (DOT_COLORS[terminal.activity] ?? "bg-gray-500");

	function handleClick() {
		dispatch({ type: "SET_ACTIVE", key: terminal.key });
	}

	function handleClose(e: React.MouseEvent) {
		e.stopPropagation();
		void bridge.terminal.close({ terminalId: terminal.terminalId });
		dispatch({ type: "REMOVE_TERMINAL", key: terminal.key });
	}

	function handleDragStart(e: React.DragEvent) {
		e.dataTransfer.setData("text/plain", terminal.key);
		e.dataTransfer.effectAllowed = "move";
		if (dragRef.current) {
			dragRef.current.style.opacity = "0.5";
		}
	}

	function handleDragEnd() {
		if (dragRef.current) {
			dragRef.current.style.opacity = "1";
		}
	}

	function handleDragOver(e: React.DragEvent) {
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";
	}

	function handleDrop(e: React.DragEvent) {
		e.preventDefault();
		const draggedKey = e.dataTransfer.getData("text/plain");
		if (draggedKey && draggedKey !== terminal.key) {
			dispatch({ type: "REORDER_TERMINAL", draggedKey, beforeKey: terminal.key });
		}
	}

	const statusText =
		terminal.status === "exited" ? `Exited (${terminal.exitCode ?? "?"})` : terminal.activityText;

	return (
		<div
			ref={dragRef}
			onClick={handleClick}
			draggable
			onDragStart={handleDragStart}
			onDragEnd={handleDragEnd}
			onDragOver={handleDragOver}
			onDrop={handleDrop}
			className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer rounded group ${
				isActive
					? "bg-black/10 dark:bg-white/10 text-gray-900 dark:text-white"
					: "text-gray-500 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-gray-200"
			}`}
		>
			<span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
			<div className="truncate flex-1 min-w-0">
				<div className="truncate">{terminal.commandName}</div>
				{statusText && <div className="truncate text-[0.7em] opacity-60">{statusText}</div>}
			</div>
			<button
				onClick={handleClose}
				className="opacity-0 group-hover:opacity-100 text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-200 shrink-0"
			>
				&times;
			</button>
		</div>
	);
}
