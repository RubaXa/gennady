// @file: Causal regressions for reviewed MAIN safety/config carry into V2.
// @spec: CLI
// @consumers: node:test

import { it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { collectAndCompare } from '../../cmd/sync/sync-core.ts';
import { resolvePackageDir } from '../../../shared/common/sync/sync-core.shared.ts';
import { GennadyRc } from '../../../shared/backend/rc/rc-config.ts';
import { resolveSafeVerifyCommands } from '../../cmd/_shared/prompt/logic/verify-commands/resolve-verify-commands.logic.ts';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const tsx = fileURLToPath(import.meta.resolve('tsx'));

function fixture(run: (root: string) => void): void {
  const root = fs.mkdtempSync(join(tmpdir(), 'main-carry-safety-'));
  try {
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

it('full sync preserves unknown project-owned root bytes and deletes only owned subtree stale files', () => {
  fixture((root) => {
    const sourceDir = join(root, 'package', 'ai', 'directives');
    const targetDir = join(root, 'project', 'ai', 'directives');
    fs.mkdirSync(join(sourceDir, 'coding'), { recursive: true });
    fs.mkdirSync(join(targetDir, 'coding'), { recursive: true });
    fs.writeFileSync(join(sourceDir, 'coding', 'current.xml'), 'current');
    fs.writeFileSync(join(targetDir, 'coding', 'stale.xml'), 'retired package bytes');
    const userBytes = Buffer.from('PROJECT-OWNED: custom knowledge & <anchors>\n');
    for (const name of ['knowledge.xml', 'custom.txt']) {
      fs.writeFileSync(join(targetDir, name), userBytes);
    }
    const result = collectAndCompare(
      {
        readFile: fs.readFileSync,
        writeFile: fs.writeFileSync,
        mkdir: fs.mkdirSync,
        stat: fs.statSync,
        readdir: fs.readdirSync,
        unlink: fs.unlinkSync,
        cwd: root,
      },
      { sourceDir, targetDir }
    );
    assert.deepEqual(
      result.deleted.map((entry) => entry.relativePath),
      ['coding/stale.xml']
    );
    assert.equal(fs.existsSync(join(targetDir, 'coding', 'stale.xml')), false);
    for (const name of ['knowledge.xml', 'custom.txt']) {
      assert.deepEqual(fs.readFileSync(join(targetDir, name)), userBytes);
      assert.ok(result.warnings.some((warning) => warning.includes(name)));
    }
    assert.equal(fs.existsSync(join(sourceDir, 'knowledge.xml')), false);
  });
});

it('foreign cwd resolves actual source-layout package instead of returning permissive null', () => {
  fixture((root) => {
    assert.equal(resolvePackageDir(root, 'ai/directives'), join(repo, 'ai/directives'));
  });
});

for (const entry of ['services/agent-mon/index.ts', 'dist/chunks/nested/entry.js']) {
  it(`package discovery walks actual package metadata from ${entry}`, () => {
    fixture((root) => {
      const packageDir = join(root, 'installed');
      const entryFile = join(packageDir, entry);
      fs.mkdirSync(dirname(entryFile), { recursive: true });
      fs.mkdirSync(join(packageDir, 'ai/directives'), { recursive: true });
      fs.writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name: 'gennady' }));
      fs.writeFileSync(entryFile, '');
      assert.equal(
        resolvePackageDir(
          join(root, 'foreign'),
          'ai/directives',
          () => pathToFileURL(entryFile).href
        ),
        join(packageDir, 'ai/directives')
      );
    });
  });
}

it('lint implementation import does not inspect argv, print, exit or mutate files', () => {
  fixture((root) => {
    const file = join(root, 'untouched.ts');
    fs.writeFileSync(file, 'export const x = 1;\n');
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        tsx,
        '--input-type=module',
        '-e',
        `process.argv = ['node', 'gennady', 'lint', '--unknown']; await import(${JSON.stringify(pathToFileURL(join(repo, 'cli/cmd/lint/lint.cmd.ts')).href)}); console.log('IMPORT_RETURNED');`,
      ],
      { cwd: root, encoding: 'utf-8', env: { ...process.env, NODE_NO_WARNINGS: '1' } }
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(result.stdout, 'IMPORT_RETURNED\n');
    assert.equal(result.stderr, '');
    assert.equal(fs.readFileSync(file, 'utf-8'), 'export const x = 1;\n');
  });
});

it('lint CLI bootstrap preserves invalid/clean/dirty exit and output behavior', () => {
  fixture((root) => {
    const clean = join(root, 'clean.ts');
    const dirty = join(root, 'dirty.ts');
    fs.writeFileSync(
      clean,
      '// @file: Clean fixture.\n// @consumers: TestRunner\n/** @purpose Test constant. */\nexport const VALUE = 42;\n'
    );
    fs.writeFileSync(dirty, 'export const VALUE = 42;\n');
    const run = (...args: string[]) =>
      spawnSync(process.execPath, ['--import', tsx, join(repo, 'cli/cmd/lint/index.ts'), ...args], {
        cwd: root,
        encoding: 'utf-8',
      });
    const invalid = run('--unknown');
    assert.equal(invalid.status, 4);
    assert.match(invalid.stdout, /ERR_CLI_LINT_UNKNOWN_FLAG/);
    const good = run(clean);
    assert.equal(good.status, 0, good.stdout + good.stderr);
    assert.equal(good.stdout, '✅ [LintCommand#run] [linting → clean] no errors\n');
    const bad = run(dirty);
    assert.equal(bad.status, 1);
    assert.match(bad.stdout, /dirty\.ts:\d+:\d+: error:/);
  });
});

it('independent RC sections accept absent models but reject malformed present models', () => {
  fixture((root) => {
    const rc = join(root, '.gennadyrc');
    for (const sections of [{ verify: { use: ['golang'] } }, {}, { models: [] }]) {
      fs.writeFileSync(rc, JSON.stringify(sections));
      const config = new GennadyRc(root);
      assert.equal(config.isValid(), true, JSON.stringify(sections));
      assert.deepEqual(config.getModels(), []);
    }
    for (const models of [null, {}, 'bad', 42]) {
      fs.writeFileSync(rc, JSON.stringify({ models }));
      const config = new GennadyRc(root);
      assert.equal(config.isValid(), false);
      assert.deepEqual(config.getModels(), []);
      assert.match(config.getError()!.message, /GENNADY_RC_ERROR_CONFIG/);
    }
  });
});

it('safe Go prompt checks formatting without rewriting unformatted project bytes', () => {
  fixture((root) => {
    fs.writeFileSync(join(root, 'go.mod'), 'module example.com/safety\n\ngo 1.22\n');
    const file = join(root, 'main.go');
    const original = 'package main\nfunc main(){println("hello")}\n';
    fs.writeFileSync(file, original);
    const cases = {
      'main_test.go':
        'package main\nimport "testing"\nfunc TestMainFile(t *testing.T){t.Log("hello")}\n',
      'external_test.go':
        'package main_test\nimport "testing"\nfunc TestExternal(t *testing.T){t.Log("hello")}\n',
      'cgo.go': 'package main\nimport "C"\nfunc cgoFixture(){println("hello")}\n',
    };
    for (const [name, bytes] of Object.entries(cases)) fs.writeFileSync(join(root, name), bytes);
    const commands = resolveSafeVerifyCommands(root);
    assert.ok(!commands.some((command) => /go fmt|gofmt\s+-w/.test(command)), commands.join('\n'));
    const format = commands.find((command) => command.includes('gofmt -l'));
    assert.ok(format, 'format check must be retained, not simply removed');
    const result = spawnSync('/bin/sh', ['-c', format], {
      cwd: root,
      encoding: 'utf-8',
      env: {
        ...process.env,
        GOENV: 'off',
        GOWORK: 'off',
        GOPROXY: 'off',
        GOTOOLCHAIN: 'local',
        CGO_ENABLED: '1',
        GOCACHE: join(root, 'go-cache'),
        GOMODCACHE: join(root, 'go-mod-cache'),
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /main\.go/);
    assert.equal(fs.readFileSync(file, 'utf-8'), original);
    for (const [name, bytes] of Object.entries(cases)) {
      assert.ok(result.stdout.includes(name), `${name} must be covered by formatting check`);
      assert.equal(fs.readFileSync(join(root, name), 'utf-8'), bytes);
    }
  });
});
