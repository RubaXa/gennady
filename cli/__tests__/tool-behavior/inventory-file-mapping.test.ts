// @file: Real-CLI proof that the audit reverse-inventory sweep uses the module File Mapping, not its directory.
// @spec: CLI-SDD-TASK
// @consumers: CI

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { TEST_PROCESS_TIMEOUT_MS } from '../../../utils/test/process-budget.ts';
import { buildFixture } from '../directive-tool-contract/fixture.ts';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const GENNADY_ENTRY = join(REPO_ROOT, 'cli', 'gennady.ts');
const TSX_LOADER = join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'loader.mjs');

function runCli(args: readonly string[], cwd: string) {
  const result = spawnSync(process.execPath, ['--import', TSX_LOADER, GENNADY_ENTRY, ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, GENNADY_NO_UPDATE_CHECK: '1' },
    timeout: TEST_PROCESS_TIMEOUT_MS,
  });
  return {
    exitCode: result.status ?? 1,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    stdout: result.stdout ?? '',
  };
}

describe('audit reverse inventory over a shared directory', () => {
  it('sweeps the module File Mapping files and ignores foreign files in the same directory', () => {
    const fx = buildFixture();
    try {
      appendFileSync(
        join(fx.root, fx.specPath),
        [
          '<!--SECTION:FILE_STRUCTURE-->',
          '',
          '## 6. File Structure',
          '',
          '**File Mapping:**',
          '',
          '- `src/greeter.ts`: greeting implementation',
          '- `src/greeter.test.ts`: greeting tests',
          '',
          '<!--/SECTION:FILE_STRUCTURE-->',
          '',
        ].join('\n')
      );
      // Another module's file in the same shared directory, not yet marked up by its owner.
      writeFileSync(
        join(fx.root, 'src', 'promo.ts'),
        "export function promoBanner(): string {\n  return 'promo';\n}\n"
      );

      const scope = runCli(['sdd-task', '--group-scope', fx.taskId], fx.root);
      assert.equal(scope.exitCode, 0, scope.output);
      const inventory = /^inventory-files:\n((?: {2}\S.*\n?)+)/m.exec(scope.stdout)?.[1] ?? '';
      const files = inventory
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      assert.ok(files.includes('src/greeter.ts'), scope.stdout);
      assert.ok(!files.includes('src/promo.ts'), scope.stdout);

      const mapped = runCli(
        ['lint', `--spec=${fx.specPath}`, '--inventory-reverse', 'src', ...files],
        fx.root
      );
      assert.equal(mapped.exitCode, 0, mapped.output);
      assert.doesNotMatch(mapped.output, /promoBanner/);

      const directory = runCli(
        ['lint', `--spec=${fx.specPath}`, '--inventory-reverse', 'src'],
        fx.root
      );
      assert.equal(directory.exitCode, 1, directory.output);
      assert.match(directory.output, /ERR_CLI_LINT_INVENTORY_UNDECLARED[^\n]*promoBanner/);
    } finally {
      rmSync(fx.root, { recursive: true, force: true });
    }
  });

  it('lists JavaScript File Mapping sources in inventory-files', () => {
    const fx = buildFixture();
    try {
      appendFileSync(
        join(fx.root, fx.specPath),
        '<!--SECTION:FILE_STRUCTURE-->\n\n**File Mapping:**\n\n- `src/greeter.ts`: greeting implementation\n- `src/legacy.js`: legacy helper\n\n<!--/SECTION:FILE_STRUCTURE-->\n'
      );
      writeFileSync(join(fx.root, 'src', 'legacy.js'), 'export function legacy() {}\n');
      const scope = runCli(['sdd-task', '--group-scope', fx.taskId], fx.root);
      assert.equal(scope.exitCode, 0, scope.output);
      const inventory = /^inventory-files:\n((?: {2}\S.*\n?)+)/m.exec(scope.stdout)?.[1] ?? '';
      assert.deepStrictEqual(
        inventory
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
        ['src/greeter.ts', 'src/legacy.js'],
        scope.stdout
      );
    } finally {
      rmSync(fx.root, { recursive: true, force: true });
    }
  });

  it('reports INVALID instead of the directory fallback for a broken or file-less mapping', () => {
    for (const mapping of [
      '- src/greeter.ts without backticks',
      '- `src/never-created.ts`: planned helper',
      // A mask next to a valid row: the mapped set is incomplete, not just the masked row.
      '- `src/greeter.ts`: greeting implementation\n- `src/radars/*`: radar helpers',
    ]) {
      const fx = buildFixture();
      try {
        appendFileSync(
          join(fx.root, fx.specPath),
          `<!--SECTION:FILE_STRUCTURE-->\n\n**File Mapping:**\n\n${mapping}\n\n<!--/SECTION:FILE_STRUCTURE-->\n`
        );
        const scope = runCli(['sdd-task', '--group-scope', fx.taskId], fx.root);
        assert.equal(scope.exitCode, 0, scope.output);
        assert.match(scope.stdout, /^inventory-files: INVALID — \S/m, mapping);
        assert.doesNotMatch(scope.stdout, /^inventory-files:\n {2}—$/m, mapping);
      } finally {
        rmSync(fx.root, { recursive: true, force: true });
      }
    }
  });
});

it('mixed supported/unsupported source mapping is incomplete, never a partial full sweep', () => {
  const fx = buildFixture();
  try {
    appendFileSync(
      join(fx.root, fx.specPath),
      '\n<!--SECTION:FILE_STRUCTURE-->\n**File Mapping:**\n- `src/greeter.ts`: implementation\n- `src/worker.go`: companion implementation\n<!--/SECTION:FILE_STRUCTURE-->\n'
    );
    writeFileSync(join(fx.root, 'src/worker.go'), 'package worker\n');
    const result = runCli(['sdd-task', '--group-scope', fx.taskId], fx.root);
    assert.equal(result.exitCode, 0, result.output);
    assert.match(result.stdout, /inventory-files: INVALID.*worker.go.*language adapter/);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});
