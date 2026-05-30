// @file: Unit tests for buildIndex — inverted word index from file headers and entity DBC contracts.
// @consumers: OrientCommand
// @tasks: TSK-55

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex } from '../core/build-index.ts';
import type { ScannedFile, FileWordRef } from '../orient.types.ts';

function makeFile(overrides: Partial<ScannedFile> = {}): ScannedFile {
  return {
    absPath: '/project/src/test.ts',
    header: { file: '', tasks: [], consumers: [] },
    exports: [],
    ...overrides,
  };
}

describe('buildIndex', () => {
  it('contract index type: returns Map<string, Set<FileWordRef>>', () => {
    const result = buildIndex([]);
    assert.ok(result instanceof Map);
  });

  it('indexes words from @file: value', () => {
    const file = makeFile({
      header: { file: 'project scanner library', tasks: [], consumers: [] },
    });
    const index = buildIndex([file]);

    const refs = index.get('scanner');
    assert.ok(refs, 'word "scanner" should be indexed');
    const arr = [...refs!];
    const match = arr.find((r) => r.source === 'file');
    assert.ok(match);
    assert.strictEqual(match!.file, '/project/src/test.ts');
  });

  it('indexes words from entity @purpose text', () => {
    const file = makeFile({
      header: { file: 'Some file', tasks: [], consumers: [] },
      exports: [
        {
          name: 'parseConfig',
          kind: 'function',
          contract: {
            entries: [{ type: 'purpose', value: 'Parse configuration files', issues: [] }],
            format: 'multi-line',
          },
          rawJsdoc: '/** @purpose Parse configuration files */',
        },
      ],
    });
    const index = buildIndex([file]);

    const refs = index.get('configuration');
    assert.ok(refs, 'word "configuration" should be indexed');
    const arr = [...refs!];
    const match = arr.find((r) => r.source === 'entity');
    assert.ok(match);
    assert.strictEqual(match!.entity, 'parseConfig');
  });

  it('skips file with empty @file: header', () => {
    const file = makeFile({ header: { file: '', tasks: [], consumers: [] } });
    const index = buildIndex([file]);
    assert.strictEqual(index.size, 0);
  });

  it('skips entity without @purpose tag', () => {
    const file = makeFile({
      exports: [
        {
          name: 'helper',
          kind: 'function',
          contract: { entries: [], format: 'multi-line' },
          rawJsdoc: '',
        },
      ],
    });
    const index = buildIndex([file]);
    assert.strictEqual(index.size, 0);
  });

  it('uses description tag as fallback for @purpose', () => {
    const file = makeFile({
      exports: [
        {
          name: 'handler',
          kind: 'function',
          contract: {
            entries: [{ type: 'description', value: 'Handle incoming requests', issues: [] }],
            format: 'multi-line',
          },
          rawJsdoc: '',
        },
      ],
    });
    const index = buildIndex([file]);

    const refs = index.get('requests');
    assert.ok(refs);
  });

  it('normalizes words to lowercase', () => {
    const file = makeFile({ header: { file: 'Project Scanner', tasks: [], consumers: [] } });
    const index = buildIndex([file]);

    const refs = index.get('scanner');
    assert.ok(refs);
  });

  it('filters single-character words', () => {
    const file = makeFile({ header: { file: 'a project scanner b c', tasks: [], consumers: [] } });
    const index = buildIndex([file]);

    assert.ok(index.has('project'));
    assert.ok(index.has('scanner'));
    assert.strictEqual(index.has('a'), false);
    assert.strictEqual(index.has('b'), false);
    assert.strictEqual(index.has('c'), false);
  });
});
