import { getProgrammingLanguage } from '../../common/language.ts';
import { countTokens } from '../../common/tokens.ts';

const CONFIG_FILE_PATTERNS = [
  '^package\\.json',
  '^tsconfig\\.json',
  '^babel\\.config\\.json',
  '^\\.pnpmfile\\.cjs',
  '^\\.yarnrc(?:\\.(?:yml|yaml))?',
  '^go\\.(?:mod|sum)',
  '^\\.env(?:\\.[\\w]+)?',
  '^\\..+',
  '.*\\.(?:yml|yaml|rc|ini|conf)',
];

const LOCKFILE_PATTERNS = [
  '^package-lock\\.json',
  '^npm-shrinkwrap\\.json',
  '^yarn(?:-lock)?\\.(?:yaml|yml|toml)',
  '^pnpm-lock\\.yaml',
  '^composer\\.lock',
  '^podfile\\.lock',
  '^go\\.sum',
  '^gemfile\\.lock',
];

const FILE_CATEGORY_REGEX: Record<string, RegExp> = {
  doc: /\.(md|markdown|txt|rst)$/i,
  cfg: new RegExp(CONFIG_FILE_PATTERNS.join('|'), 'i'),
  img: /\.(png|jpe?g|gif|svg|bmp|tiff|ico)$/i,
  css: /\.(css|less|scss|sass|styl)$/i,
  html: /\.(html?)$/i,
  code: /\.(js|jsx|ts|tsx|java|py|c|cpp|cs|rb|php|go|swift|m|mm|kt|sh|bash)$/i,
  bin: /^(exe|dll|so|bin)\b/i,
  lock: new RegExp(LOCKFILE_PATTERNS.join('|'), 'i'),
  json: /\.json$/i,
};

/**
 * @purpose Описать один файл из разобранного git diff: флаги, имя, категория, язык, хунки и число токенов.
 * @consumer git-core, commit-gen, review-gen
 */
export type ParsedDiffFile = {
  isNew: boolean;
  isDeleted: boolean;
  isRenamed: boolean;
  filename: string;
  oldFilename: string | null;
  newFileMode: string | null;
  deletedFileMode: string | null;
  diff: { tokens: number; hunks: { header: string; changes: string[]; tokens: number }[] };
  tokens: number;
  metadata: Record<string, unknown>;
  ext: string;
  category: string;
  programmingLanguage?: string;
};

type FileMetadata = {
  extra?: string[];
};

const getCategory = (filename: string, metadata?: FileMetadata): string => {
  if (metadata?.extra && Array.isArray(metadata.extra)) {
    for (const line of metadata.extra) {
      if (/^Binary files? /i.test(line) || /GIT binary patch/i.test(line)) {
        return 'bin';
      }
    }
  }

  const category =
    Object.entries(FILE_CATEGORY_REGEX).find(([, regexp]) => regexp.test(filename))?.[0] ?? 'other';
  return category;
};

/**
 * @purpose Разобрать текстовый вывод git diff в нормализованный список файлов с метаданными и токенами.
 * @consumer git/git-core, commit-gen, review-gen
 * @pre Входная строка должна соответствовать формату `git diff` (unified diff).
 * @param diffText Полный текстовый diff для парсинга.
 * @returns Массив объектов файлов с признаками (isNew/isDeleted/isRenamed), категориями, языком, хунками и суммой токенов.
 */
export const parseGitDiff = (diffText: string): ParsedDiffFile[] => {
  const lines = diffText.split('\n');
  const result: ParsedDiffFile[] = [];
  let currentFile: ParsedDiffFile | null = null;
  let currentHunk: { header: string; changes: string[]; tokens: number } | null = null;

  lines.forEach((line) => {
    if (line.startsWith('diff --git')) {
      if (currentFile) {
        currentFile.diff.tokens = currentFile.diff.hunks.reduce(
          (sum, hunk) => sum + hunk.tokens,
          0
        );
        currentFile.tokens = currentFile.diff.tokens;
        const extMatch = currentFile.filename.match(/\.([^.]+)$/);
        currentFile.ext = extMatch?.[1]?.toLowerCase() ?? '';
        currentFile.category = getCategory(
          currentFile.filename,
          currentFile.metadata as FileMetadata
        );
        currentFile.programmingLanguage = getProgrammingLanguage(currentFile.ext);
        result.push(currentFile);
      }

      const fileMatch = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      const oldFilename = fileMatch?.[1] ?? null;
      const filename = fileMatch?.[2] ?? null;

      currentFile = {
        isNew: false,
        isDeleted: false,
        isRenamed: false,
        filename: filename ?? '',
        oldFilename: oldFilename ?? null,
        newFileMode: null,
        deletedFileMode: null,
        diff: {
          tokens: 0,
          hunks: [],
        },
        tokens: 0,
        metadata: {},
        ext: '',
        category: 'other',
        programmingLanguage: undefined,
      };

      currentHunk = null;
    } else if (currentFile && line.startsWith('new file mode')) {
      const parts = line.split(' ');
      currentFile.isNew = true;
      currentFile.newFileMode = (parts[3] ?? null) as string | null;
      (currentFile.metadata as Record<string, unknown>).newFileMode = currentFile.newFileMode;
    } else if (currentFile && line.startsWith('deleted file mode')) {
      const parts = line.split(' ');
      currentFile.isDeleted = true;
      currentFile.deletedFileMode = parts[3] ?? null;
      (currentFile.metadata as Record<string, unknown>).deletedFileMode =
        currentFile.deletedFileMode;
    } else if (currentFile && line.startsWith('old mode')) {
      const parts = line.split(' ');
      (currentFile.metadata as Record<string, unknown>).oldMode = parts[2] ?? null;
    } else if (currentFile && line.startsWith('new mode')) {
      const parts = line.split(' ');
      (currentFile.metadata as Record<string, unknown>).newMode = parts[2] ?? null;
    } else if (currentFile && line.startsWith('similarity index')) {
      const parts = line.split(' ');
      (currentFile.metadata as Record<string, unknown>).similarityIndex = parts[2] ?? null;
    } else if (currentFile && line.startsWith('rename from')) {
      const from = line.substring('rename from'.length).trim();
      currentFile.isRenamed = true;
      currentFile.oldFilename = from;
      (currentFile.metadata as Record<string, unknown>).renameFrom = from;
    } else if (currentFile && line.startsWith('rename to')) {
      const to = line.substring('rename to'.length).trim();
      currentFile.isRenamed = true;
      currentFile.filename = to;
      (currentFile.metadata as Record<string, unknown>).renameTo = to;
    } else if (currentFile && line.startsWith('index')) {
      (currentFile.metadata as Record<string, unknown>).index = line
        .substring('index'.length)
        .trim();
    } else if (currentFile && (line.startsWith('--- ') || line.startsWith('+++ '))) {
      if (line.startsWith('--- ')) {
        (currentFile.metadata as Record<string, unknown>).oldFileMarker = line;
      } else {
        (currentFile.metadata as Record<string, unknown>).newFileMarker = line;
      }
    } else if (currentFile && line.startsWith('@@')) {
      currentHunk = {
        header: line,
        changes: [line],
        tokens: countTokens(line),
      };
      currentFile.diff.hunks.push(currentHunk);
    } else if (
      currentHunk &&
      (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))
    ) {
      currentHunk.changes.push(line);
      currentHunk.tokens += countTokens(line);
    } else if (currentFile) {
      if (!Array.isArray((currentFile.metadata as Record<string, unknown>).extra)) {
        (currentFile.metadata as Record<string, unknown>).extra = [];
      }
      ((currentFile.metadata as Record<string, unknown>).extra as string[]).push(line);
    }
  });

  if (currentFile) {
    const lastFile = currentFile as ParsedDiffFile;
    const extMatch = lastFile.filename.match(/\.([^.]+)$/);
    lastFile.diff.tokens = lastFile.diff.hunks.reduce(
      (sum: number, hunk: { tokens: number }) => sum + hunk.tokens,
      0
    );
    lastFile.tokens = lastFile.diff.tokens;
    lastFile.ext = extMatch?.[1]?.toLowerCase() ?? '';
    lastFile.category = getCategory(lastFile.filename, lastFile.metadata as FileMetadata);
    lastFile.programmingLanguage = getProgrammingLanguage(lastFile.ext);
    result.push(lastFile);
  }

  return result;
};
