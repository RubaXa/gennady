// @file: Unit tests for renderFileList and renderFileLine — universal file list format.
// @consumers: OrientCommand
// @tasks: TSK-55

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderFileLine, renderFileList } from '../render/render-file-list.ts';
import type { ScannedFile } from '../orient.types.ts';

function makeFile(absPath: string, overrides: Partial<ScannedFile> = {}): ScannedFile {
  return {
    absPath,
    header: { file: 'test purpose', tasks: ['TSK-01'], consumers: ['ConsumerA'] },
    exports: [
      {
        name: 'fn',
        kind: 'function',
        contract: { entries: [], format: 'multi-line' },
        rawJsdoc: '',
      },
    ],
    ...overrides,
  };
}

describe('renderFileLine', () => {
  it('file line format: universal format with all fields', () => {
    const file = makeFile('/project/src/test.ts');
    const line = renderFileLine(file, '/project');
    assert.match(line, /src\/test\.ts/);
    assert.match(line, /@file: test purpose/);
    assert.match(line, /@tasks: TSK-01/);
    assert.match(line, /@consumers: ConsumerA/);
    assert.match(line, /@exports: 1/);
  });

  it('marks missing @file: header', () => {
    const file = makeFile('/project/src/bad.ts', {
      header: { file: '', tasks: [], consumers: [] },
    });
    const line = renderFileLine(file, '/project');
    assert.match(line, /\(missing\)/);
  });

  it('omits empty @tasks: and @consumers: blocks', () => {
    const file = makeFile('/project/src/minimal.ts', {
      header: { file: 'minimal', tasks: [], consumers: [] },
      exports: [],
    });
    const line = renderFileLine(file, '/project');
    assert.strictEqual(line.includes('@tasks:'), false);
    assert.strictEqual(line.includes('@consumers:'), false);
    assert.match(line, /@exports: 0/);
  });

  it('shows relative path', () => {
    const file = makeFile('/project/src/lib/util.ts');
    const line = renderFileLine(file, '/project');
    assert.ok(line.startsWith('src/lib/util.ts'));
  });
});

describe('renderFileList', () => {
  it('returns array of formatted lines', () => {
    const file = makeFile('/project/src/a.ts');
    const lines = renderFileList([file], '/project');
    assert.strictEqual(lines.length, 1);
    assert.match(lines[0], /a\.ts/);
  });
});
