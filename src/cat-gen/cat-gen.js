import fs from 'fs';
import path from 'path';

export const DEFAULT_EXTENSIONS = ['.js', '.ts', '.tsx'];

export const catGen = (paths, extensions = DEFAULT_EXTENSIONS) => {
	const extSet = new Set(extensions);
	const results = [];

	const process = (inputPath) => {
		const absoluteInputPath = path.resolve(inputPath);
		if (!fs.existsSync(absoluteInputPath)) {
			return;
		}
		
		const initialStats = fs.statSync(absoluteInputPath);
		const basePath = initialStats.isDirectory()
			? absoluteInputPath
			: path.dirname(absoluteInputPath);

		const walk = (currentPath) => {
			const stats = fs.statSync(currentPath);
			
			if (stats.isFile()) {
				const ext = path.extname(currentPath).toLowerCase();
				if (extSet.has(ext)) {
					const relativePath = path.relative(basePath, currentPath);
					
					const content = fs.readFileSync(currentPath, 'utf8');
					results.push({
						basePath,
						currentPath,
						relativePath,
						content,
					});
				}
			} else if (stats.isDirectory()) {
				const entries = fs.readdirSync(currentPath, { withFileTypes: true });
				for (const entry of entries) {
					const fullEntryPath = path.join(currentPath, entry.name);
					walk(fullEntryPath);
				}
			}
		};

		walk(absoluteInputPath);
	};

	(paths || []).forEach(process);
	return results;
};
	
