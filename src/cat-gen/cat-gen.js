import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';

export const DEFAULT_EXTENSIONS = [
	'.md',
	'.mdc',
	'.js',
	'.ts',
	'.tsx',
	'.go',
	'.sh',
	'.puml',
	'.',
];

/**
 * Получить содержимое всех файлов по указанным glob-паттернам.
 * @param {string | string[]} paths - Путь к файлу/директории или glob-паттерн(ы) для поиска файлов.
 * @param {{
 *   extensions?: string[],
 *   exclude?: string[],
 *   ignoreDefaultExcludes?: boolean
 * }} [options] - Опции для поиска и фильтрации.
 * @returns {{absPath: string, relativePath: string, contents: string}[]}
 */
export const catGen = (paths, options = {}) => {
	// AI: DEFAULTS_AND_OPTIONS_DESTRUCTURING_START
	const {
		extensions = DEFAULT_EXTENSIONS,
		exclude = [],
		ignoreDefaultExcludes = false,
	} = options;
	// AI: DEFAULTS_AND_OPTIONS_DESTRUCTURING_END

	// AI: IGNORE_PATTERNS_CONSTRUCTION_START
	const userExclude = Array.isArray(exclude) ? exclude : [exclude];
	const ignorePatterns = userExclude.map(pattern => {
		if (!/[*{}!]/.test(pattern)) {
			return `**/*${pattern}`;
		}
		return pattern;
	});

	if (!ignoreDefaultExcludes) {
		ignorePatterns.push('**/node_modules/**');
	}
	// AI: IGNORE_PATTERNS_CONSTRUCTION_END

	// AI: PATHS_PREPROCESSING_START
	const inputPaths = Array.isArray(paths) ? paths : [paths];
	const processedPaths = inputPaths.map(pattern => {
		try {
			// Check if the path exists and is a directory.
			if (fs.existsSync(pattern) && fs.statSync(pattern).isDirectory()) {
				// If so, convert it to a recursive glob pattern. 'src' -> 'src/**/*'
				return path.join(pattern, '**/*');
			}
		} catch (e) {
			// Ignore errors (e.g., permissions) and treat it as a glob pattern.
		}
		// Otherwise, use it as a file path or an explicit glob pattern.
		return pattern;
	});
	// AI: PATHS_PREPROCESSING_END

	// AI: FAST_GLOB_EXECUTION_START
	const globOptions = {
		ignore: ignorePatterns,
		onlyFiles: true,
		absolute: true,
		dot: ignoreDefaultExcludes,
		suppressErrors: true, // Prevent crashes on invalid patterns
	};
	
	let foundFiles = fg.sync(processedPaths, globOptions); // Using the processed paths
	// AI: FAST_GLOB_EXECUTION_END

	// AI: EXTENSIONS_FILTERING_START
	const extSet = new Set(Array.isArray(extensions) ? extensions : [extensions]);
	if (!extSet.has('*')) {
		foundFiles = foundFiles.filter(filePath => extSet.has(path.extname(filePath).toLowerCase()));
	}
	// AI: EXTENSIONS_FILTERING_END

	// AI: RESULT_TRANSFORMATION_START
	const results = foundFiles.map(absPath => {
		try {
			const contents = fs.readFileSync(absPath, 'utf8');
			const relativePath = path.relative(process.cwd(), absPath);
			return {
				absPath,
				relativePath,
				contents,
			};
		} catch (error) {
			return null;
		}
	}).filter(Boolean);
	// AI: RESULT_TRANSFORMATION_END
	
	return results;
};