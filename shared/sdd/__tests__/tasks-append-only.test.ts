// @file: Unit tests for tasks-append-only — TASKS_APPEND_ONLY header regression check.
// @consumers: check
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkTasksAppendOnly, parseTasksHeader } from '../tasks-append-only.ts';

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
});

describe('checkTasksAppendOnly', () => {
  it('новый файл (нет версии в HEAD) → без findings', () => {
    const findings = checkTasksAppendOnly('f.ts', '// @tasks: TSK-1', null);
    assert.deepStrictEqual(findings, []);
  });

  it('id только добавлены → без findings', () => {
    const findings = checkTasksAppendOnly(
      'f.ts',
      '// @tasks: TSK-116, TSK-136',
      '// @tasks: TSK-116'
    );
    assert.deepStrictEqual(findings, []);
  });

  it('прежний id пропал → SDD_TASKS_APPEND_ONLY_REGRESSION', () => {
    const findings = checkTasksAppendOnly(
      'f.ts',
      '// @tasks: TSK-136',
      '// @tasks: TSK-116, TSK-136'
    );
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.code, 'SDD_TASKS_APPEND_ONLY_REGRESSION');
    assert.strictEqual(findings[0]?.severity, 'error');
    assert.match(findings[0]?.message ?? '', /TSK-116/);
  });

  it('N/A → реальный id не считается регрессией', () => {
    const findings = checkTasksAppendOnly('f.ts', '// @tasks: TSK-80', '// @tasks: N/A');
    assert.deepStrictEqual(findings, []);
  });
});
