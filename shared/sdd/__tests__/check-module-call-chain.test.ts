// @file: Unit tests for checkModuleCallChain — a module spec with ≥2 entities needs a sequence
// diagram or an equivalent step table for its main scenario.
// @consumers: check
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkModuleCallChain } from '../check.ts';

const SPEC_FILE = 'specs/inbox-core/inbox-core.spec.md';

const moduleWithEntities = (n: number, extra = ''): string =>
  [
    '<!--SECTION:MODULE_VISION-->',
    'x',
    '<!--/SECTION:MODULE_VISION-->',
    '<!--SECTION:ENTITY_INVENTORY-->',
    '| Name | Type | Purpose |',
    '|---|---|---|',
    ...Array.from({ length: n }, (_, i) => `| E${i} | Utility | does thing |`),
    '<!--/SECTION:ENTITY_INVENTORY-->',
    extra,
  ].join('\n');

const newFormatRequirements = (): string =>
  [
    '<!--SECTION:MODULE_REQUIREMENTS-->',
    '### IC-REQ-1 [должен]',
    '',
    '**Когда** X, **сервис должен** сделать Y.',
    '<!--/SECTION:MODULE_REQUIREMENTS-->',
  ].join('\n');

describe('checkModuleCallChain', () => {
  it('not a module spec (no MODULE_VISION) → no findings', () => {
    assert.deepStrictEqual(
      checkModuleCallChain(
        SPEC_FILE,
        '<!--SECTION:ENTITY_INVENTORY-->\n<!--/SECTION:ENTITY_INVENTORY-->'
      ),
      []
    );
  });

  it('module spec with < 2 entities → no findings (floor is ≥2)', () => {
    assert.deepStrictEqual(checkModuleCallChain(SPEC_FILE, moduleWithEntities(1)), []);
  });

  it('module spec with ≥2 entities, no sequence diagram, no step table → warn (old format)', () => {
    const findings = checkModuleCallChain(SPEC_FILE, moduleWithEntities(2));
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.code, 'SDD_MODULE_NO_CALL_CHAIN');
    assert.strictEqual(findings[0]?.severity, 'warn');
    assert.match(findings[0]?.message ?? '', /2 entities/);
  });

  it('module spec with ≥2 entities in the new Requirements format → error, not warn', () => {
    const content = moduleWithEntities(2) + '\n' + newFormatRequirements();
    const findings = checkModuleCallChain(SPEC_FILE, content);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.severity, 'error');
  });

  it('a ```mermaid sequenceDiagram block satisfies the rung → no findings', () => {
    const content = moduleWithEntities(
      3,
      ['```mermaid', 'sequenceDiagram', '  Client->>API: POST /orders', '```'].join('\n')
    );
    assert.deepStrictEqual(checkModuleCallChain(SPEC_FILE, content), []);
  });

  it('a flowchart (not sequenceDiagram) does NOT satisfy the rung', () => {
    const content = moduleWithEntities(
      3,
      ['```mermaid', 'flowchart LR', '  A --> B', '```'].join('\n')
    );
    const findings = checkModuleCallChain(SPEC_FILE, content);
    assert.strictEqual(findings[0]?.code, 'SDD_MODULE_NO_CALL_CHAIN');
  });

  it('a step table with Шаг/Участник/Действие/Данные columns satisfies the rung → no findings', () => {
    const content = moduleWithEntities(
      3,
      [
        '| Шаг | Участник | Действие | Данные |',
        '|---|---|---|---|',
        '| 1 | Client | calls API | order payload |',
      ].join('\n')
    );
    assert.deepStrictEqual(checkModuleCallChain(SPEC_FILE, content), []);
  });

  it('an English step table (Step/Actor/Action/Data) also satisfies the rung', () => {
    const content = moduleWithEntities(
      3,
      [
        '| Step | Actor | Action | Data |',
        '|---|---|---|---|',
        '| 1 | Client | calls API | order payload |',
      ].join('\n')
    );
    assert.deepStrictEqual(checkModuleCallChain(SPEC_FILE, content), []);
  });

  it('a table missing one required column (no Данные/Data) does NOT satisfy the rung', () => {
    const content = moduleWithEntities(
      3,
      ['| Шаг | Участник | Действие |', '|---|---|---|', '| 1 | Client | calls API |'].join('\n')
    );
    const findings = checkModuleCallChain(SPEC_FILE, content);
    assert.strictEqual(findings[0]?.code, 'SDD_MODULE_NO_CALL_CHAIN');
  });
});
