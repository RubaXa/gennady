// @file: Вернуть безопасные команды проверки кода для текущего проекта (тесты, линт, типы).
// @consumers: build-ai-verify-placeholders.logic
// @tasks: N/A

import fs from 'node:fs';
import path from 'node:path';

/**
 * @purpose Вернуть безопасные команды проверки кода для текущего проекта (тесты, линт, типы).
 * @consumer build-ai-verify-placeholders.logic
 * @param projectRoot Корень проекта для поиска маркеров и package.json.
 * @returns Список команд в порядке приоритета; пустой список, если детектор не нашёл безопасный набор.
 */

type MarkerRow = {
  readonly kind: 'marker';
  readonly relativePath: string;
  readonly commands: readonly string[];
};

type NpmScriptGroup = {
  readonly preferredNames: readonly string[];
  readonly fallbackPatterns: readonly RegExp[];
};

type NpmPackageJsonRow = {
  readonly kind: 'npm-package-json';
  readonly scriptGroups: readonly NpmScriptGroup[];
  readonly maxCommands: number;
};

type DetectorRow = MarkerRow | NpmPackageJsonRow;

const DETECTOR_ROWS: readonly DetectorRow[] = [
  {
    kind: 'marker',
    relativePath: 'go.mod',
    commands: ['go test ./...', 'go vet ./...', 'go fmt ./...'],
  },
  {
    kind: 'npm-package-json',
    scriptGroups: [
      {
        preferredNames: [
          'test',
          'test:run',
          'test:ci',
          'test:app',
          'mc:test',
          'unit',
          'jest',
          'vitest',
        ],
        fallbackPatterns: [/(^|:)test($|:)/i, /(^|:)unit($|:)/i, /(^|:)spec($|:)/i],
      },
      {
        preferredNames: ['lint:ci', 'lint', 'eslint', 'stylelint', 'format:check'],
        fallbackPatterns: [/(^|:)(lint|eslint|stylelint)($|:)/i],
      },
      {
        preferredNames: ['type-check', 'typecheck', 'check'],
        fallbackPatterns: [/(^|:)(typecheck|type-check|check)($|:)/i],
      },
    ],
    maxCommands: 5,
  },
  {
    kind: 'marker',
    relativePath: 'Cargo.toml',
    commands: ['cargo test', 'cargo clippy'],
  },
];

function isProjectFile(projectRoot: string, relativePath: string): boolean {
  const abs = path.join(projectRoot, relativePath);
  try {
    return fs.existsSync(abs) && fs.statSync(abs).isFile();
  } catch {
    return false;
  }
}

function isWatchLikeScript(scriptName: string, scriptCommand: string): boolean {
  const lowerName = scriptName.toLowerCase();
  const lowerCommand = scriptCommand.toLowerCase();

  if (/(^|:|-)watch($|:|-)/i.test(lowerName)) {
    return true;
  }

  const watchPatterns = [
    /(^|\s)--watch(?:[=\s]|$)/i,
    /(^|\s)--watchall(?:[=\s]|$)/i,
    /(^|\s)watch(?:\s|$)/i,
    /(^|\s)nodemon(?:\s|$)/i,
  ];

  return watchPatterns.some((pattern) => pattern.test(lowerCommand));
}

function pickGroupCommand(
  scripts: Record<string, string>,
  group: NpmScriptGroup,
  pickedNames: Set<string>
): string | null {
  const safeEntries = Object.entries(scripts).filter(
    ([name, command]) => !pickedNames.has(name) && !isWatchLikeScript(name, command)
  );

  for (const preferredName of group.preferredNames) {
    if (safeEntries.some(([name]) => name === preferredName)) {
      return preferredName;
    }
  }

  for (const [name] of safeEntries) {
    if (group.fallbackPatterns.some((pattern) => pattern.test(name))) {
      return name;
    }
  }

  return null;
}

function tryNpmPackageJson(projectRoot: string, row: NpmPackageJsonRow): string[] | null {
  const pkgPath = path.join(projectRoot, 'package.json');
  let raw: string;
  try {
    if (!fs.existsSync(pkgPath) || !fs.statSync(pkgPath).isFile()) {
      return null;
    }
    raw = fs.readFileSync(pkgPath, 'utf-8');
  } catch {
    return null;
  }

  let pkg: { scripts?: Record<string, string> };
  try {
    pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
  } catch {
    return null;
  }

  const scripts = pkg.scripts;
  if (!scripts || typeof scripts !== 'object') {
    return null;
  }

  const picked: string[] = [];
  const pickedNames = new Set<string>();

  for (const group of row.scriptGroups) {
    const selectedName = pickGroupCommand(scripts, group, pickedNames);
    if (selectedName) {
      picked.push(`npm run ${selectedName}`);
      pickedNames.add(selectedName);
    }

    if (picked.length >= row.maxCommands) {
      break;
    }
  }

  if (picked.length === 0) {
    return null;
  }

  return picked.slice(0, row.maxCommands);
}

export function resolveSafeVerifyCommands(projectRoot: string): string[] {
  for (const row of DETECTOR_ROWS) {
    if (row.kind === 'marker') {
      if (isProjectFile(projectRoot, row.relativePath)) {
        return [...row.commands];
      }
      continue;
    }

    if (row.kind === 'npm-package-json') {
      const cmds = tryNpmPackageJson(projectRoot, row);
      if (cmds != null && cmds.length > 0) {
        return cmds;
      }
    }
  }

  return [];
}
