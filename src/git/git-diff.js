import { getProgrammingLanguage } from "../utils/language.js";
import { countTokens } from "../utils/tokens.js";

const CONFIG_FILE_PATTERNS = [
	'^package\\.json',
	'^tsconfig\\.json',
	'^babel\\.config\\.json',
	'^\\.pnpmfile\\.cjs',
	'^\\.yarnrc(?:\\.(?:yml|yaml))?',
	'^go\\.(?:mod|sum)',
	'^\\.env(?:\\.[\\w]+)?',
	'^\\..+',
	'.*\\.(?:yml|yaml|rc|ini|conf)'
];

const LOCKFILE_PATTERNS = [
	'^package-lock\\.json',
	'^npm-shrinkwrap\\.json',
	'^yarn(?:-lock)?\\.(?:yaml|yml|toml)',
	'^pnpm-lock\\.yaml',
	'^composer\\.lock',
	'^podfile\\.lock',
	'^go\\.sum',
	'^gemfile\\.lock'
];

const FILE_CATEGORY_REGEX = {
	doc: /\.(md|markdown|txt|rst)$/i,
	cfg: new RegExp(CONFIG_FILE_PATTERNS.join('|'), 'i'),
	img: /\.(png|jpe?g|gif|svg|bmp|tiff|ico)$/i,
	css: /\.(css|less|scss|sass|styl)$/i,
	html: /\.(html?)$/i,
	code: /\.(js|jsx|ts|tsx|java|py|c|cpp|cs|rb|php|go|swift|m|mm|kt)$/i,
	bin: /^(exe|dll|so|bin)\b/i,
	lock: new RegExp(LOCKFILE_PATTERNS.join('|'), 'i'),
	json: /\.json$/i
};

const getCategory = (filename, metadata) => {
	if (metadata && metadata.extra && Array.isArray(metadata.extra)) {
		for (let line of metadata.extra) {
			if (/^Binary files? /i.test(line) || /GIT binary patch/i.test(line)) {
				return 'bin';
			}
		}
	}

	const category = Object.entries(FILE_CATEGORY_REGEX).find(
		([, regexp]) => regexp.test(filename)
	)?.[0] || 'other';

	return category;
};

export const parseGitDiff = (diffText) => {
	const lines = diffText.split('\n');
	const result = [];
	let currentFile = null;
	let currentHunk = null;

	lines.forEach((line) => {
		if (line.startsWith('diff --git')) {
			if (currentFile) {
				currentFile.diff.tokens = currentFile.diff.hunks.reduce((sum, hunk) => sum + hunk.tokens, 0);
				currentFile.tokens = currentFile.diff.tokens;
				const extMatch = currentFile.filename.match(/\.([^.]+)$/);
				currentFile.ext = extMatch ? extMatch[1].toLowerCase() : '';
				currentFile.category = getCategory(currentFile.filename, currentFile.metadata);
				currentFile.programmingLanguage = getProgrammingLanguage(currentFile.ext);
				result.push(currentFile);
			}

			const fileMatch = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
			const oldFilename = fileMatch ? fileMatch[1] : null;
			const filename = fileMatch ? fileMatch[2] : null;

			currentFile = {
				isNew: false,
				isDeleted: false,
				isRenamed: false,
				filename,
				oldFilename,
				newFileMode: null,
				deletedFileMode: null,
				diff: {
					tokens: 0,
					hunks: []
				},
				tokens: 0,
				metadata: {},
				ext: '',
				category: 'other',
				programmingLanguage: undefined
			};

			currentHunk = null;
		} else if (currentFile && line.startsWith('new file mode')) {
			const parts = line.split(' ');

			currentFile.isNew = true;
			currentFile.newFileMode = parts[3] || null;
			currentFile.metadata.newFileMode = currentFile.newFileMode;
		} else if (currentFile && line.startsWith('deleted file mode')) {
			const parts = line.split(' ');

			currentFile.isDeleted = true;
			currentFile.deletedFileMode = parts[3] || null;
			currentFile.metadata.deletedFileMode = currentFile.deletedFileMode;
		} else if (currentFile && line.startsWith('old mode')) {
			const parts = line.split(' ');
			currentFile.metadata.oldMode = parts[2] || null;
		} else if (currentFile && line.startsWith('new mode')) {
			const parts = line.split(' ');
			currentFile.metadata.newMode = parts[2] || null;
		} else if (currentFile && line.startsWith('similarity index')) {
			const parts = line.split(' ');
			currentFile.metadata.similarityIndex = parts[2] || null;
		} else if (currentFile && line.startsWith('rename from')) {
			const from = line.substring('rename from'.length).trim();

			currentFile.isRenamed = true;
			currentFile.oldFilename = from;
			currentFile.metadata.renameFrom = from;
		} else if (currentFile && line.startsWith('rename to')) {
			const to = line.substring('rename to'.length).trim();

			currentFile.isRenamed = true;
			currentFile.filename = to;
			currentFile.metadata.renameTo = to;
		} else if (currentFile && line.startsWith('index')) {
			currentFile.metadata.index = line.substring('index'.length).trim();
		} else if (currentFile && (line.startsWith('--- ') || line.startsWith('+++ '))) {
			if (line.startsWith('--- ')) {
				currentFile.metadata.oldFileMarker = line;
			} else {
				currentFile.metadata.newFileMarker = line;
			}
		} else if (currentFile && line.startsWith('@@')) {
			currentHunk = {
				header: line,
				changes: [line],
				tokens: countTokens(line)
			};
			currentFile.diff.hunks.push(currentHunk);
		} else if (currentHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))) {
			currentHunk.changes.push(line);
			currentHunk.tokens += countTokens(line);
		} else if (currentFile) {
			if (!currentFile.metadata.extra) {
				currentFile.metadata.extra = [];
			}
			currentFile.metadata.extra.push(line);
		}
	});

	if (currentFile) {
		const extMatch = currentFile.filename.match(/\.([^.]+)$/);

		currentFile.diff.tokens = currentFile.diff.hunks.reduce((sum, hunk) => sum + hunk.tokens, 0);
		currentFile.tokens = currentFile.diff.tokens;
		currentFile.ext = extMatch ? extMatch[1].toLowerCase() : '';
		currentFile.category = getCategory(currentFile.filename, currentFile.metadata);
		currentFile.programmingLanguage = getProgrammingLanguage(currentFile.ext);

		result.push(currentFile);
	}

	return result;
}
