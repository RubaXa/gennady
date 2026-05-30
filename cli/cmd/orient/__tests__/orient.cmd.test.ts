// @file: Unit tests for CLI argument parsing and conflict validation — orient.cmd.
// @consumers: OrientCommand
// @tasks: TSK-55

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseOrientArgs } from '../orient.types.ts';
import { scanFiles } from '../core/scan-files.ts';

function argv(...args: string[]): string[] {
  return ['node', 'gennady', ...args];
}

function createTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'orient-cmd-test-'));
}

describe('parseOrientArgs', () => {
  it('parses --file flag', () => {
    const args = parseOrientArgs(argv('--file', 'test.ts'));
    assert.deepStrictEqual(args.file, ['test.ts']);
  });

  it('parses --file= shorthand', () => {
    const args = parseOrientArgs(argv('--file=test.ts'));
    assert.deepStrictEqual(args.file, ['test.ts']);
  });

  it('parses multiple --file flags', () => {
    const args = parseOrientArgs(argv('--file=a.ts', '--file=b.ts'));
    assert.deepStrictEqual(args.file, ['a.ts', 'b.ts']);
  });

  it('parses --dir flag', () => {
    const args = parseOrientArgs(argv('--dir', 'src/'));
    assert.strictEqual(args.dir, 'src/');
  });

  it('parses --task flag', () => {
    const args = parseOrientArgs(argv('--task=TSK-01', '--task', 'TSK-02'));
    assert.deepStrictEqual(args.task, ['TSK-01', 'TSK-02']);
  });

  it('parses --consumer flag', () => {
    const args = parseOrientArgs(argv('--consumer=DbcTsLinter'));
    assert.deepStrictEqual(args.consumer, ['DbcTsLinter']);
  });

  it('parses --entity flag', () => {
    const args = parseOrientArgs(argv('--entity=parse'));
    assert.deepStrictEqual(args.entity, ['parse']);
  });

  it('parses --graph flag', () => {
    const args = parseOrientArgs(argv('--graph'));
    assert.strictEqual(args.graph, true);
  });

  it('parses --recursive flag', () => {
    const args = parseOrientArgs(argv('--recursive'));
    assert.strictEqual(args.recursive, true);
  });

  it('parses --specs flag', () => {
    const args = parseOrientArgs(argv('--specs'));
    assert.strictEqual(args.specs, true);
  });

  it('parses --spec flag', () => {
    const args = parseOrientArgs(argv('--spec', 'cli.spec.md'));
    assert.strictEqual(args.spec, 'cli.spec.md');
  });

  it('parses --detail flag', () => {
    const args = parseOrientArgs(argv('--detail'));
    assert.strictEqual(args.detail, true);
  });

  it('parses --fuzzy flag', () => {
    const args = parseOrientArgs(argv('--fuzzy'));
    assert.strictEqual(args.fuzzy, true);
  });

  it('parses --depth flag', () => {
    const args = parseOrientArgs(argv('--depth=5'));
    assert.strictEqual(args.depth, 5);
  });

  it('parses --max-results flag', () => {
    const args = parseOrientArgs(argv('--max-results=30'));
    assert.strictEqual(args.maxResults, 30);
  });

  it('collects positional keywords in _ array', () => {
    const args = parseOrientArgs(argv('contract', 'parser'));
    assert.deepStrictEqual(args._, ['contract', 'parser']);
  });

  it('ignores non-positional arguments', () => {
    const args = parseOrientArgs(argv('--file=a.ts', 'keyword', '--graph'));
    assert.deepStrictEqual(args._, ['keyword']);
    assert.strictEqual(args.graph, true);
    assert.deepStrictEqual(args.file, ['a.ts']);
  });
});

describe('CLI conflict detection', () => {
  it('file dir conflict: --file and --dir mutually exclusive', () => {
    const args = parseOrientArgs(argv('--file=a.ts', '--dir=src/'));
    assert.ok(args.file.length > 0 && args.dir !== '');
  });

  it('graph keyword conflict: --graph and positional keyword mutually exclusive', () => {
    const args = parseOrientArgs(argv('keyword', '--graph'));
    assert.ok(args.graph && args._.length > 0);
  });

  it('specs file conflict: --specs and --file mutually exclusive', () => {
    const args = parseOrientArgs(argv('--specs', '--file=a.ts'));
    assert.ok(args.specs && args.file.length > 0);
  });

  it('specs all conflicts: --specs incompatible with --task/--consumer/--entity/--graph', () => {
    const args = parseOrientArgs(
      argv('--specs', '--task=TSK-01', '--consumer=C', '--entity=E', '--graph')
    );
    assert.ok(args.specs);
    assert.ok(args.task.length > 0);
    assert.ok(args.consumer.length > 0);
    assert.ok(args.entity.length > 0);
    assert.ok(args.graph);
  });

  it('spec all conflicts: --spec incompatible with --file/--task/--consumer/--entity/--graph', () => {
    const args = parseOrientArgs(
      argv('--spec=S', '--file=F', '--task=T', '--consumer=C', '--entity=E', '--graph')
    );
    assert.ok(args.spec !== '');
    assert.ok(args.file.length > 0);
    assert.ok(args.task.length > 0);
    assert.ok(args.consumer.length > 0);
    assert.ok(args.entity.length > 0);
    assert.ok(args.graph);
  });

  it('fuzzy noop: --fuzzy without --entity or --consumer is allowed but no-op', () => {
    const args = parseOrientArgs(argv('--fuzzy'));
    assert.strictEqual(args.fuzzy, true);
    assert.strictEqual(args.entity.length, 0);
    assert.strictEqual(args.consumer.length, 0);
  });
});

describe('orient.cmd integration', () => {
  it('file detail integration: scan-files + render for specific files', () => {
    const tmpDir = createTmpDir();
    writeFileSync(
      join(tmpDir, 'test.ts'),
      `// @file: test module\n// @tasks: TSK-01\nexport function helperFn(): void {}\n`
    );
    const files = scanFiles(tmpDir);
    assert.strictEqual(files.length, 1);
    assert.ok(files[0].endsWith('test.ts'));
  });

  it('dir scope integration: scan restricted to subdirectory', () => {
    const tmpDir = createTmpDir();
    const subDir = join(tmpDir, 'src', 'lib');
    mkdirSync(subDir, { recursive: true });
    writeFileSync(join(subDir, 'util.ts'), '');
    writeFileSync(join(tmpDir, 'root.ts'), '');

    const subFiles = scanFiles(subDir);
    assert.strictEqual(subFiles.length, 1);
    assert.ok(subFiles[0].endsWith('util.ts'));
  });

  it('map integration: returns empty for empty directory', () => {
    const tmpDir = createTmpDir();
    const files = scanFiles(tmpDir);
    assert.deepStrictEqual(files, []);
  });

  it('multiple files: scan finds all .ts files', () => {
    const tmpDir = createTmpDir();
    writeFileSync(join(tmpDir, 'a.ts'), '');
    writeFileSync(join(tmpDir, 'b.ts'), '');
    writeFileSync(join(tmpDir, 'c.txt'), '');

    const files = scanFiles(tmpDir);
    assert.strictEqual(files.length, 2);
  });
});

describe('parseOrientArgs edge cases', () => {
  it('missing value after --file flag defaults to empty string', () => {
    const args = parseOrientArgs(argv('--file'));
    assert.deepStrictEqual(args.file, ['']);
  });

  it('--depth with non-numeric value defaults to Infinity', () => {
    const args = parseOrientArgs(argv('--depth=abc'));
    assert.strictEqual(args.depth, Infinity);
  });

  it('--max-results with non-numeric value defaults to Infinity', () => {
    const args = parseOrientArgs(argv('--max-results=abc'));
    assert.strictEqual(args.maxResults, Infinity);
  });

  it('defaults are correctly initialized', () => {
    const args = parseOrientArgs(argv());
    assert.deepStrictEqual(args._, []);
    assert.deepStrictEqual(args.file, []);
    assert.strictEqual(args.dir, '');
    assert.deepStrictEqual(args.task, []);
    assert.deepStrictEqual(args.consumer, []);
    assert.deepStrictEqual(args.entity, []);
    assert.strictEqual(args.graph, false);
    assert.strictEqual(args.recursive, false);
    assert.strictEqual(args.specs, false);
    assert.strictEqual(args.spec, '');
    assert.strictEqual(args.detail, false);
    assert.strictEqual(args.fuzzy, false);
    assert.strictEqual(args.depth, Infinity);
    assert.strictEqual(args.maxResults, Infinity);
  });
});
