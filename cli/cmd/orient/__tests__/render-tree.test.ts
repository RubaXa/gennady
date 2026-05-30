// @file: Unit tests for renderTree — project tree view with depth control and annotations (S1 scenario).
// @consumers: OrientCommand
// @tasks: TSK-55

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderTree } from '../render/render-tree.ts';
import type { ScannedFile } from '../orient.types.ts';

function makeFile(absPath: string, fileHeader?: string): ScannedFile {
  return {
    absPath,
    header: { file: fileHeader ?? 'test file', tasks: ['TSK-01'], consumers: ['ConsumerA'] },
    exports: [],
  };
}

describe('renderTree', () => {
  it('render tree with depth: shows indicator when depth exceeded', () => {
    const file = makeFile('/project/src/lib/utils/helper.ts');
    const lines = renderTree([file], '/project', 1, false, 100);
    const output = lines.join('\n');
    assert.ok(
      output.includes('more dir') || output.includes('more dirs'),
      `expected depth indicator, got:\n${output}`
    );
  });

  it('depth singular plural: uses correct form for 1 item', () => {
    const file = makeFile('/project/src/deep/nested/file.ts');
    const lines = renderTree([file], '/project', 1, false, 100);
    const output = lines.join('\n');
    // with depth=1 and 1 dir + 0 files at root level, indicator should use singular
    assert.ok(
      output.includes('1 more dir') || output.includes('1 more file'),
      `expected singular indicator, got:\n${output}`
    );
  });

  it('renders file with annotations in tree', () => {
    const file = makeFile('/project/src/util.ts', 'utility module');
    const lines = renderTree([file], '/project', 10, false, 100);
    const output = lines.join('\n');
    assert.match(output, /util\.ts/);
    assert.match(output, /@file: utility module/);
  });

  it('shows detail when showDetail=true', () => {
    const file = makeFile('/project/src/a.ts');
    file.exports = [
      {
        name: 'helperFn',
        kind: 'function',
        contract: {
          entries: [{ type: 'purpose', value: 'Provides helper utilities', issues: [] }],
          format: 'multi-line',
        },
        rawJsdoc: '/** @purpose Provides helper utilities */',
      },
    ];
    const lines = renderTree([file], '/project', 10, true, 100);
    const output = lines.join('\n');
    assert.match(output, /helperFn\(function\)/);
    assert.match(output, /Provides helper utilities/);
  });
});
