// @file: Unit tests for parseModuleEntities / parseModuleContracts / parseModuleRequirements — both spec formats, plus the legacy-table false-positive guard.
// @consumers: parse-module

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseModuleEntities,
  parseModuleContracts,
  parseModuleRequirements,
} from '../core/parse-module.ts';

describe('parseModuleEntities', () => {
  it('reads entities from a v2 ENTITY_INVENTORY marker', () => {
    const content =
      '<!--SECTION:ENTITY_INVENTORY-->\n| Name | Type | Purpose |\n| `Foo` | Service | x |\n<!--/SECTION:ENTITY_INVENTORY-->';
    assert.deepStrictEqual(parseModuleEntities(content), ['Foo']);
  });

  it('reads entities from a legacy numbered heading', () => {
    const content =
      '## 2. Entity Inventory (Closed-World)\n| Name | Type | Purpose |\n| `Foo` | Service | x |';
    assert.deepStrictEqual(parseModuleEntities(content), ['Foo']);
  });

  it('returns [] when the module has no inventory in either format (old format, never had one)', () => {
    assert.deepStrictEqual(parseModuleEntities('# Module: x\n\n## 1. Module Vision\ntext'), []);
  });
});

describe('parseModuleContracts', () => {
  it('reads Port/Adapter/Service names+kind from a v2 marker', () => {
    const content = [
      '<!--SECTION:MODULE_CONTRACTS-->',
      '#### Port: `TodoStore`',
      '- x',
      '',
      '#### Adapter: `DexieTodoStore`',
      '- **Implements:** `TodoStore`',
      '<!--/SECTION:MODULE_CONTRACTS-->',
    ].join('\n');
    assert.deepStrictEqual(parseModuleContracts(content), [
      { name: 'TodoStore', kind: 'port' },
      { name: 'DexieTodoStore', kind: 'adapter' },
    ]);
  });

  it('reads a legacy "#### Service: `Name`" heading', () => {
    const content = '## 4. Module Contracts (DbC)\n\n#### Service: `FileHeaderCheck`\ndetail';
    assert.deepStrictEqual(parseModuleContracts(content), [
      { name: 'FileHeaderCheck', kind: 'service' },
    ]);
  });

  it('returns [] when there is no Module Contracts section', () => {
    assert.deepStrictEqual(parseModuleContracts('# Module: x\n\ntext'), []);
  });

  it('recognizes kinds outside the documented Port/Adapter/Service set (found live on gennady-todomvc)', () => {
    const content = [
      '<!--SECTION:MODULE_CONTRACTS-->',
      '### Components',
      '#### Component: `TodoApp`',
      '- x',
      '',
      '### Hooks',
      '#### Hook: `useTodos`',
      '- y',
      '<!--/SECTION:MODULE_CONTRACTS-->',
    ].join('\n');
    assert.deepStrictEqual(parseModuleContracts(content), [
      { name: 'TodoApp', kind: 'component' },
      { name: 'useTodos', kind: 'hook' },
    ]);
  });

  it('does not mistake a plain entity heading (no leading kind word) for a contract', () => {
    const content =
      '<!--SECTION:MODULE_CONTRACTS-->\n#### `JustAName`\ndetail\n<!--/SECTION:MODULE_CONTRACTS-->';
    assert.deepStrictEqual(parseModuleContracts(content), []);
  });
});

describe('parseModuleRequirements — flat format', () => {
  it('parses id + title from the flat REQUIREMENT_ENTRY_FORMAT heading', () => {
    const content = [
      '<!--SECTION:MODULE_REQUIREMENTS-->',
      '### FOO-REQ-1 [должен]',
      '**Когда** X, **сервис должен** Y.',
      '',
      '> because Z.',
      '<!--/SECTION:MODULE_REQUIREMENTS-->',
    ].join('\n');
    const got = parseModuleRequirements(content);
    assert.equal(got.length, 1);
    assert.equal(got[0]?.id, 'FOO-REQ-1');
    assert.equal(got[0]?.title, 'Когда X, сервис должен Y.');
  });

  it('truncates a very long title', () => {
    const longSentence = `**Когда** ${'x'.repeat(120)}, **сервис должен** Y.`;
    const content = `<!--SECTION:MODULE_REQUIREMENTS-->\n### FOO-REQ-1 [должен]\n${longSentence}\n<!--/SECTION:MODULE_REQUIREMENTS-->`;
    const got = parseModuleRequirements(content);
    assert.ok((got[0]?.title.length ?? 0) <= 80);
    assert.ok(got[0]?.title.endsWith('…'));
  });

  it('handles the "· нештатная" class tag the same as a plain class', () => {
    const content = [
      '<!--SECTION:MODULE_REQUIREMENTS-->',
      '### FOO-REQ-2 [должен · нештатная]',
      '**Если** X, **то сервис должен** Y.',
      '<!--/SECTION:MODULE_REQUIREMENTS-->',
    ].join('\n');
    const got = parseModuleRequirements(content);
    assert.equal(got[0]?.id, 'FOO-REQ-2');
  });
});

describe('parseModuleRequirements — legacy table format', () => {
  it('parses id + description from a legacy | ID | description | table', () => {
    const content = [
      '## 4. Requirements & Constraints',
      '',
      '### 4.1 Functional Requirements',
      '',
      '| ID | Требование |',
      '| --- | --- |',
      '| **File header** |  |',
      '| FR-01 | Проверить наличие заголовка |',
      '| FR-09a | Рекурсивный обход по умолчанию |',
    ].join('\n');
    const got = parseModuleRequirements(content);
    assert.deepStrictEqual(
      got.map((r) => r.id),
      ['FR-01', 'FR-09a']
    );
    assert.equal(got[0]?.title, 'Проверить наличие заголовка');
  });

  it('a Rules sub-table inside the same section does not add false requirement rows (no cell ends in a digit)', () => {
    const content = [
      '## 4. Requirements & Constraints',
      '',
      '### Rules',
      '| Rule | Category | Source |',
      '| --- | --- | --- |',
      '| Testing | coding | infra |',
      '',
      '### Functional Requirements',
      '| ID | Требование |',
      '| --- | --- |',
      '| FR-01 | real requirement |',
    ].join('\n');
    const got = parseModuleRequirements(content);
    assert.deepStrictEqual(
      got.map((r) => r.id),
      ['FR-01']
    );
  });

  it('known heuristic limitation: an all-caps id-shaped cell in an unrelated table inside the same section is picked up too (id-shape check alone cannot tell them apart)', () => {
    const content = [
      '## 4. Requirements & Constraints',
      '',
      '### Compatibility',
      '| Standard | Note |',
      '| --- | --- |',
      '| ES5 | still supported |',
      '',
      '### Functional Requirements',
      '| ID | Требование |',
      '| --- | --- |',
      '| FR-01 | real requirement |',
    ].join('\n');
    const got = parseModuleRequirements(content);
    // Documents the known trade-off (see spec Handoff "Open risks") rather than asserting a
    // precision this shape-only heuristic cannot deliver.
    assert.deepStrictEqual(
      got.map((r) => r.id),
      ['ES5', 'FR-01']
    );
  });

  it('returns [] when the section itself is absent (old format never had one)', () => {
    assert.deepStrictEqual(parseModuleRequirements('# Module: x\n\n## 1. Module Vision\ntext'), []);
  });
});
