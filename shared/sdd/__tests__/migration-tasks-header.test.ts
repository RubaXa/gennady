// @file: Migration-only task-header evidence and canonical ownership-header parser regressions.
// @spec: SHARED
// @consumers: check

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseTasksHeader } from '../migration-tasks-header.ts';
import { parseSourceOwnershipHeader } from '../source-ownership-header.ts';

describe('parseTasksHeader', () => {
  it('парсит список id, отбрасывая N/A', () => {
    assert.deepStrictEqual(parseTasksHeader('// @tasks: N/A, TSK-80'), ['TSK-80']);
  });

  it('несколько id без N/A', () => {
    assert.deepStrictEqual(parseTasksHeader('// @tasks: TSK-116, TSK-136'), ['TSK-116', 'TSK-136']);
  });

  it('только N/A → пустой список', () => {
    assert.deepStrictEqual(parseTasksHeader('// @tasks: N/A'), []);
  });

  it('заголовок отсутствует → пустой список', () => {
    assert.deepStrictEqual(parseTasksHeader('// @file: x\n// @consumers: y'), []);
  });

  it('не принимает @tasks из тела или prose example за leading header', () => {
    assert.deepStrictEqual(
      parseTasksHeader(
        '// @file: x\n// @consumers: y\nexport const example = "@tasks:";\n// @tasks: BODY-1\n'
      ),
      []
    );
  });

  it('поддерживает canonical # header после shebang и license prelude', () => {
    assert.deepStrictEqual(
      parseTasksHeader(
        '#!/usr/bin/env python3\n# Copyright Demo\n# @file: x\n# @tasks: PY-1\n# @consumers: y\n'
      ),
      ['PY-1']
    );
  });
});

describe('parseSourceOwnershipHeader', () => {
  it('останавливает header перед blank + declaration JSDoc', () => {
    const parsed = parseSourceOwnershipHeader(
      '// @file: x\n// @tasks: TSK-1\n// @consumers: y\n\n/** declaration docs */\nexport const x = 1;\n'
    );
    assert.deepStrictEqual(
      parsed.blocks.map((block) => block.tag),
      ['file', 'tasks', 'consumers']
    );
    assert.deepStrictEqual(parsed.ambiguousHeaderIndexes, []);
    assert.deepStrictEqual(parsed.bodyTagIndexes, []);
  });

  it('не перескакивает через leading declaration JSDoc к prose @tasks', () => {
    const parsed = parseSourceOwnershipHeader(
      '/** declaration docs with an example below */\n// @tasks: EXAMPLE-1\nexport const x = 1;\n'
    );
    assert.deepStrictEqual(parsed.blocks, []);
    assert.deepStrictEqual(parsed.bodyTagIndexes, [1]);
    assert.deepStrictEqual(
      parseTasksHeader('/** docs */\n// @tasks: EXAMPLE-1\nexport const x = 1;'),
      []
    );
  });

  it('сохраняет multiline continuation и отличает ambiguous comment', () => {
    const parsed = parseSourceOwnershipHeader(
      '// @file: x\n//   exact detail\n// ambiguous\n// @tasks: TSK-1\n// @consumers: y\n'
    );
    assert.deepStrictEqual(parsed.blocks[0]?.lines, ['// @file: x', '//   exact detail']);
    assert.deepStrictEqual(parsed.ambiguousHeaderIndexes, [2]);
  });

  it('сохраняет paragraph break внутри multiline ownership block', () => {
    const parsed = parseSourceOwnershipHeader(
      [
        '// @file: x',
        '//   first paragraph',
        '//',
        '//     second paragraph after formatter indentation',
        '// @tasks: TSK-1',
        '// @consumers: y',
        '',
      ].join('\n')
    );
    assert.deepStrictEqual(parsed.ambiguousHeaderIndexes, []);
    assert.deepStrictEqual(parsed.blocks[0]?.lines, [
      '// @file: x',
      '//   first paragraph',
      '//',
      '//     second paragraph after formatter indentation',
    ]);
  });

  it('оставляет duplicate и empty tags видимыми fail-closed caller', () => {
    const parsed = parseSourceOwnershipHeader(
      '// @file:\n// @tasks: TSK-1\n// @tasks: TSK-2\n// @consumers: y\n'
    );
    assert.strictEqual(parsed.blocks.filter((block) => block.tag === 'file')[0]?.value, '');
    assert.strictEqual(parsed.blocks.filter((block) => block.tag === 'tasks').length, 2);
  });
});
