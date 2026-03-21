interface Props {
	onCreateProject: () => void;
}

export function EmptyState({ onCreateProject }: Props) {
	return (
		<div className="flex-1 flex items-center justify-center">
			<div className="text-center">
				<h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Welcome to pterm</h1>
				<p className="text-gray-500 dark:text-gray-400 mb-6">Create a project to get started</p>
				<button
					onClick={onCreateProject}
					className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium"
				>
					Create Project
				</button>
			</div>
		</div>
	);
}
