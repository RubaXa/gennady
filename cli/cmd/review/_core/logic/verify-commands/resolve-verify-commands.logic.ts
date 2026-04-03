import fs from 'node:fs';
import path from 'node:path';

/**
 * @purpose Безопасные команды проверки перед коммитом (тесты, статика, формат/линт без тяжёлой сборки артефактов).
 * Не подставляем: build/publish/ci как «проверку», если только они есть — тогда пустой список → общие инструкции в плейсхолдерах.
 */

type MarkerRow = {
  readonly kind: 'marker';
  readonly relativePath: string;
  readonly commands: readonly string[];
};

type NpmPackageJsonRow = {
  readonly kind: 'npm-package-json';
  /** Группы имён скриптов по приоритету; только ключи из SAFE_NPM_SCRIPT_KEYS считаются безопасными. */
  readonly scriptGroups: readonly (readonly string[])[];
  readonly maxCommands: number;
};

type DetectorRow = MarkerRow | NpmPackageJsonRow;

/**
 * Имена `npm run <name>`, которые по смыслу — проверка качества, а не упаковка/деплой.
 * Не включаем: build, dev, start, ci (часто полный пайплайн), prepublish, deploy.
 */
const SAFE_NPM_SCRIPT_KEYS = new Set<string>([
  'test',
  'unit',
  'test:ci',
  'jest',
  'vitest',
  'lint',
  'eslint',
  'stylelint',
  'check',
  'type-check',
  'typecheck',
]);

const DETECTOR_ROWS: readonly DetectorRow[] = [
  {
    kind: 'marker',
    relativePath: 'go.mod',
    commands: ['go test ./...', 'go vet ./...', 'go fmt ./...'],
  },
  {
    kind: 'npm-package-json',
    scriptGroups: [
      ['test', 'unit', 'test:ci', 'jest', 'vitest'],
      ['lint', 'eslint', 'stylelint'],
      ['check', 'type-check', 'typecheck'],
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

  const names = new Set(
    Object.keys(scripts).filter((k) => SAFE_NPM_SCRIPT_KEYS.has(k))
  );
  if (names.size === 0) {
    return null;
  }

  const picked: string[] = [];

  for (const group of row.scriptGroups) {
    for (const key of group) {
      if (names.has(key)) {
        picked.push(`npm run ${key}`);
        break;
      }
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

/**
 * @purpose Команды проверки, безопасные для подстановки в промпт (без git / без npx gennady).
 * Пустой массив → в плейсхолдерах используются общие формулировки (README, CI).
 */
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
