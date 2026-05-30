// @file: Unit tests for renderDetail — detailed file view with full DBC contracts (S5 scenario).
// @consumers: OrientCommand
// @tasks: TSK-55

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderDetail } from '../render/render-detail.ts';
import type { ScannedFile } from '../orient.types.ts';

function makeFile(absPath: string, overrides: Partial<ScannedFile> = {}): ScannedFile {
  return {
    absPath,
    header: { file: 'test file', tasks: ['TSK-01'], consumers: ['ConsumerA'] },
    exports: [],
    ...overrides,
  };
}

describe('renderDetail', () => {
  it('full detail render: shows header blocks', () => {
    const file = makeFile('/project/src/test.ts');
    const lines = renderDetail([file], '/project');
    const output = lines.join('\n');
    assert.match(output, /@file: test file/);
    assert.match(output, /@tasks: TSK-01/);
    assert.match(output, /@consumers: ConsumerA/);
    assert.match(output, /@exports: 0/);
  });

  it('missing header: shows (missing) for empty @file:', () => {
    const file = makeFile('/project/src/bad.ts', {
      header: { file: '', tasks: [], consumers: [] },
    });
    const lines = renderDetail([file], '/project');
    const output = lines.join('\n');
    assert.match(output, /@file: \(missing\)/);
  });

  it('no exports: shows @exports: 0 without entity list', () => {
    const file = makeFile('/project/src/empty.ts');
    const lines = renderDetail([file], '/project');
    const output = lines.join('\n');
    assert.match(output, /@exports: 0/);
  });

  it('minimal header: omits @tasks: and @consumers: when empty', () => {
    const file = makeFile('/project/src/minimal.ts', {
      header: { file: 'just a file', tasks: [], consumers: [] },
    });
    const lines = renderDetail([file], '/project');
    const output = lines.join('\n');
    assert.strictEqual(output.includes('@tasks:'), false);
    assert.strictEqual(output.includes('@consumers:'), false);
  });

  it('class entity: shows class with kind', () => {
    const file = makeFile('/project/src/service.ts', {
      exports: [
        {
          name: 'MyService',
          kind: 'class',
          contract: {
            entries: [{ type: 'purpose', value: 'Core business service', issues: [] }],
            format: 'multi-line',
          },
          rawJsdoc: '/** @purpose Core business service */',
        },
      ],
    });
    const lines = renderDetail([file], '/project');
    const output = lines.join('\n');
    assert.match(output, /MyService: class/);
  });

  it('function entity: shows signature with params and return type', () => {
    const file = makeFile('/project/src/func.ts', {
      exports: [
        {
          name: 'calculate',
          kind: 'function',
          contract: {
            entries: [
              {
                type: 'param',
                specifier: 'a',
                dataType: 'number',
                value: 'first operand',
                issues: [],
              },
              {
                type: 'param',
                specifier: 'b',
                dataType: 'number',
                value: 'second operand',
                issues: [],
              },
              { type: 'returns', dataType: 'number', value: 'sum', issues: [] },
            ],
            format: 'multi-line',
          },
          rawJsdoc: '/** @param {number} a @param {number} b @returns {number} */',
        },
      ],
    });
    const lines = renderDetail([file], '/project');
    const output = lines.join('\n');
    assert.match(output, /calculate\(a, b\)/);
  });

  it('all dbc tags: renders @throws, @sideEffect, @invariant individually', () => {
    const file = makeFile('/project/src/contracts.ts', {
      exports: [
        {
          name: 'dangerous',
          kind: 'function',
          contract: {
            entries: [
              { type: 'throws', value: 'ValidationError on invalid input', issues: [] },
              { type: 'sideEffect', value: 'Writes to log file', issues: [] },
              { type: 'invariant', value: 'Output is always sorted', issues: [] },
            ],
            format: 'multi-line',
          },
          rawJsdoc: '',
        },
      ],
    });
    const lines = renderDetail([file], '/project');
    const output = lines.join('\n');

    assert.match(output, /@throws/);
    assert.match(output, /@sideEffect/);
    assert.match(output, /@invariant/);
  });
});
