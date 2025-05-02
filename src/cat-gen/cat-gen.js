import fs from 'fs';
import path from 'path';

const DEFAULT_ALLOWED_EXTENSIONS = new Set(['.js', '.ts', '.tsx']);

export const catGen = (dirOrFile) => {
	const absoluteInputPath = path.resolve(dirOrFile);
	const initialStats = fs.statSync(absoluteInputPath);
	const basePath = initialStats.isDirectory()
		? absoluteInputPath
		: path.dirname(absoluteInputPath);

	const results = [];
	const process = (currentPath) => {
		const stats = fs.statSync(currentPath);
	
		if (stats.isFile()) {
			const ext = path.extname(currentPath).toLowerCase();
			
			if (DEFAULT_ALLOWED_EXTENSIONS.has(ext)) {
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
				process(fullEntryPath);
			}
		}
	};

	process(absoluteInputPath);

	return results;
}
	
