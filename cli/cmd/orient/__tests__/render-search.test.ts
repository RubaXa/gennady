// @file: Unit tests for renderSearch — keyword search result rendering (S4 scenario).
// @consumers: OrientCommand
// @tasks: TSK-55

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderSearch } from '../render/render-search.ts';
import type { KeywordMatch, ScannedFile } from '../orient.types.ts';

function makeFile(absPath: string): ScannedFile {
  return {
    absPath,
    header: { file: 'test file', tasks: ['TSK-01'], consumers: ['ConsumerA'] },
    exports: [],
  };
}

describe('renderSearch', () => {
  it('renders match with file path and header', () => {
    const match: KeywordMatch = {
      file: makeFile('/project/src/test.ts'),
      score: 10,
    };
    const lines = renderSearch([match], '/project');
    const output = lines.join('\n');
    assert.match(output, /src\/test\.ts/);
    assert.match(output, /@file: test file/);
  });

  it('entity match render: shows entity name when present', () => {
    const match: KeywordMatch = {
      file: makeFile('/project/src/test.ts'),
      score: 10,
      entityName: 'parseConfig',
    };
    const lines = renderSearch([match], '/project');
    const output = lines.join('\n');
    assert.match(output, /parseConfig/);
    assert.match(output, /@purpose/);
  });

  it('renders missing @file: header', () => {
    const file = makeFile('/project/src/bad.ts');
    file.header.file = '';
    const match: KeywordMatch = { file, score: 0 };
    const lines = renderSearch([match], '/project');
    const output = lines.join('\n');
    assert.match(output, /\(missing\)/);
  });

  it('renders multiple matches', () => {
    const matchA: KeywordMatch = { file: makeFile('/project/src/a.ts'), score: 20 };
    const matchB: KeywordMatch = { file: makeFile('/project/src/b.ts'), score: 10 };
    const lines = renderSearch([matchA, matchB], '/project');
    assert.strictEqual(lines.length, 2);
  });
});
