// @file: Differential and edge tests for the one-pass YAGNI source/spec indexes.
// @consumers: node:test runner
// @tasks: N/A

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { isTestFile, isUnderTestDirectory } from '../../../../shared/common/files.ts';
import { parseUsageWaiver, stripBarrelReexports } from '../../../../shared/sdd/yagni.ts';
import { selectSymbolIndex } from '../../../../services/symbol-index/select-symbol-index.ts';
import { GrepSymbolIndexAdapter } from '../../../../services/symbol-index/implementations/grep/grep-symbol-index-adapter.ts';
import { TsSymbolIndexAdapter } from '../../../../services/symbol-index/implementations/tree-sitter/ts-symbol-index-adapter.ts';
import type { SymbolIndex } from '../../../../services/symbol-index/symbol-index.types.ts';
import { indexSpecEvidence, indexUsageCounts, type YagniIndexIo } from '../yagni-index.ts';

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'yagni-index-'));
  roots.push(root);
  return root;
}

function write(root: string, path: string, content: string): string {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
  return absolute;
}

type TestAdapters = { exact: SymbolIndex; approximate: SymbolIndex };

function adapters(): TestAdapters {
  return {
    exact: new TsSymbolIndexAdapter(),
    approximate: new GrepSymbolIndexAdapter(),
  };
}

async function legacyUsageCounts(
  root: string,
  names: ReadonlySet<string>,
  files: readonly string[],
  indexes: TestAdapters
): Promise<Map<string, number>> {
  const usage = new Map<string, number>();
  for (const name of names) {
    let total = 0;
    for (const absolute of files) {
      const path = relative(root, absolute);
      if (isTestFile(path) || isUnderTestDirectory(path)) continue;
      const content = stripBarrelReexports(readFileSync(absolute, 'utf8'));
      total += (await selectSymbolIndex(path, indexes).countReferences(name, path, content)).count;
    }
    usage.set(name, Math.max(0, total - 1));
  }
  return usage;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('indexUsageCounts', () => {
  it('is differential-equivalent to the legacy per-name adapter loop', async () => {
    const root = tempRoot();
    const files = [
      write(root, 'src/main.ts', "export function alpha() {}\nalpha();\nconst text = 'alpha';\n"),
      write(root, 'src/use.ts', "alpha();\nexport { alpha } from './main.ts';\n"),
      write(
        root,
        'scripts/tool.py',
        'def handle_request(req): pass\nhandle_request(None)\na.b and a.b\n'
      ),
      write(root, 'src/__tests__/main.test.ts', 'alpha(); alpha(); alpha();\n'),
      write(root, 'src/ignored.spec.ts', 'alpha(); alpha(); alpha();\n'),
    ];
    const names = new Set(['alpha', 'handle_request', 'a.b', 'missing']);
    const legacyAdapters = adapters();
    const batchAdapters = adapters();

    const legacy = await legacyUsageCounts(root, names, files, legacyAdapters);
    const batch = await indexUsageCounts(root, names, batchAdapters);

    assert.deepStrictEqual(batch.counts, legacy);
    assert.deepStrictEqual(batch.ioIssues, []);
  });

  it('retains an unreadable/disappeared production file as an evidence-completeness issue', async () => {
    const root = '/virtual/repo';
    const io: YagniIndexIo = {
      listRegularFiles: () => ({
        files: ['/virtual/repo/good.py', '/virtual/repo/unreadable.py'],
        ioIssues: [],
      }),
      readText: (path) =>
        path.endsWith('unreadable.py')
          ? {
              ok: false,
              issue: { path, operation: 'read', reason: 'EACCES injected' },
            }
          : { ok: true, content: 'def alpha(): pass\nalpha()\n' },
    };
    const result = await indexUsageCounts(root, new Set(['alpha']), adapters(), io);
    assert.strictEqual(result.counts.get('alpha'), 1);
    assert.deepStrictEqual(result.ioIssues, [
      {
        path: '/virtual/repo/unreadable.py',
        operation: 'read',
        reason: 'EACCES injected',
      },
    ]);
  });

  it('retains an unreadable production directory instead of treating it as an empty subtree', async () => {
    const io: YagniIndexIo = {
      listRegularFiles: () => ({
        files: [],
        ioIssues: [
          {
            path: '/virtual/repo/src/private',
            operation: 'list',
            reason: 'EACCES injected',
          },
        ],
      }),
      readText: () => {
        throw new Error('no files were listed');
      },
    };
    const result = await indexUsageCounts('/virtual/repo', new Set(['alpha']), adapters(), io);
    assert.deepStrictEqual(result.ioIssues, [
      {
        path: '/virtual/repo/src/private',
        operation: 'list',
        reason: 'EACCES injected',
      },
    ]);
  });

  it('does not follow source symlinks', async () => {
    const root = tempRoot();
    const real = write(root, 'src/real.py', 'def alpha(): pass\nalpha()\n');
    symlinkSync(real, join(root, 'src/alias.py'));
    const usage = await indexUsageCounts(root, new Set(['alpha']), adapters());
    assert.strictEqual(usage.counts.get('alpha'), 1);
    assert.deepStrictEqual(usage.ioIssues, []);
  });

  it('calls only the batch seam once for one production file', async () => {
    let batchCalls = 0;
    const adapter: SymbolIndex = {
      declaredSymbols: async () => [],
      countReferences: async () => {
        throw new Error('scalar seam must not be called');
      },
      countReferencesMany: async (names) => {
        batchCalls++;
        return new Map([...names].map((name) => [name, { count: 2, precision: 'exact' }]));
      },
    };
    const io: YagniIndexIo = {
      listRegularFiles: () => ({ files: ['/virtual/repo/one.ts'], ioIssues: [] }),
      readText: () => ({ ok: true, content: 'alpha(); beta();' }),
    };
    const usage = await indexUsageCounts(
      '/virtual/repo',
      new Set(['alpha', 'beta']),
      { exact: adapter, approximate: adapter },
      io
    );
    assert.strictEqual(batchCalls, 1);
    assert.deepStrictEqual(
      usage.counts,
      new Map([
        ['alpha', 1],
        ['beta', 1],
      ])
    );
  });
});

describe('indexSpecEvidence', () => {
  it('matches the legacy first-waiver and cited-live-decision semantics', () => {
    const root = tempRoot();
    const specs = join(root, 'specs');
    write(specs, 'a.md', '### D-042 — keep alpha\n');
    const waiverFile = write(
      specs,
      'b.md',
      [
        '<!--SECTION:ENTITY_SURFACES-->',
        '### `alpha`',
        '- **Usage Waiver:** D-042 — public compatibility surface',
        '<!--/SECTION:ENTITY_SURFACES-->',
      ].join('\n')
    );
    const indexed = indexSpecEvidence(specs, new Set(['alpha']));
    const legacy = parseUsageWaiver(readFileSync(waiverFile, 'utf8'), 'alpha');

    assert.deepStrictEqual(indexed.waivers.get('alpha'), legacy);
    assert.deepStrictEqual(indexed.liveDecisions, new Set(['D-042']));
  });

  it('preserves legacy first-by-path selection when more than one waiver exists', () => {
    const root = tempRoot();
    const specs = join(root, 'specs');
    const first = write(
      specs,
      'a.md',
      [
        '### `alpha`',
        '- **Usage Waiver:** first reason',
        '',
        '### `alpha`',
        '- **Usage Waiver:** second reason in the same file',
      ].join('\n')
    );
    write(specs, 'b.md', '### `alpha`\n- **Usage Waiver:** third reason\n');
    const indexed = indexSpecEvidence(specs, new Set(['alpha']));

    assert.deepStrictEqual(indexed.waivers.get('alpha'), { reason: 'first reason' });
    assert.deepStrictEqual(
      indexed.waivers.get('alpha'),
      parseUsageWaiver(readFileSync(first, 'utf8'), 'alpha')
    );
  });

  it('retains unreadable specs instead of fabricating no-waiver evidence', () => {
    const io: YagniIndexIo = {
      listRegularFiles: () => ({ files: ['/virtual/specs/unreadable.md'], ioIssues: [] }),
      readText: (path) => ({
        ok: false,
        issue: { path, operation: 'read', reason: 'EACCES injected' },
      }),
    };
    assert.deepStrictEqual(indexSpecEvidence('/virtual/specs', new Set(['alpha']), io), {
      waivers: new Map(),
      liveDecisions: new Set(),
      ioIssues: [
        {
          path: '/virtual/specs/unreadable.md',
          operation: 'read',
          reason: 'EACCES injected',
        },
      ],
    });
  });
});
