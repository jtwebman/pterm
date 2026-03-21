import { useState, useRef, useEffect } from "react";

interface Props {
	onSearch: (query: string) => void;
	onNext: () => void;
	onPrevious: () => void;
	onClose: () => void;
}

export function SearchBar({ onSearch, onNext, onPrevious, onClose }: Props) {
	const [query, setQuery] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	function handleChange(value: string) {
		setQuery(value);
		onSearch(value);
	}

	function handleKeyDown(e: React.KeyboardEvent) {
		if (e.key === "Enter") {
			e.preventDefault();
			if (e.shiftKey) {
				onPrevious();
			} else {
				onNext();
			}
		}
		if (e.key === "Escape") {
			e.preventDefault();
			onClose();
		}
	}

	return (
		<div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 shadow-lg">
			<input
				ref={inputRef}
				type="text"
				value={query}
				onChange={(e) => handleChange(e.target.value)}
				onKeyDown={handleKeyDown}
				placeholder="Search..."
				className="bg-transparent text-gray-900 dark:text-white text-sm w-48 focus:outline-none placeholder:text-gray-400 dark:placeholder:text-gray-500"
			/>
			<button
				onClick={onPrevious}
				className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white px-1 text-sm"
				title="Previous (Shift+Enter)"
			>
				&uarr;
			</button>
			<button
				onClick={onNext}
				className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white px-1 text-sm"
				title="Next (Enter)"
			>
				&darr;
			</button>
			<button
				onClick={onClose}
				className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white px-1 text-sm"
				title="Close (Escape)"
			>
				&times;
			</button>
		</div>
	);
}
