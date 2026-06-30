// @file: Unit tests for the shared SDD section extractor.
// @consumers: section
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractSection,
  findSectionBounds,
  isValidSectionName,
  SECTION_NAME_REGEX,
} from '../section.ts';

const TICKET = [
  '# Some Ticket',
  '',
  '<!--SECTION:META-->',
  '- **Task-ID:** cli-foo',
  '- **Status:** [ ] TODO',
  '<!--/SECTION:META-->',
  '',
  '<!--SECTION:PHASE_P1-->',
  '### P1 — impl',
  '- **Rules:** none',
  '<!--/SECTION:PHASE_P1-->',
].join('\n');

describe('isValidSectionName', () => {
  it('accepts canonical names', () => {
    for (const name of [
      'META',
      'PHASES_OVERVIEW',
      'PHASE_P1',
      'PHASE_P1_FIX',
      'EXECUTION_LOG',
      'A',
      'A1',
    ]) {
      assert.strictEqual(isValidSectionName(name), true, `${name} should be valid`);
    }
  });

  it('rejects non-canonical names', () => {
    for (const name of [
      '',
      'meta',
      'Meta',
      '1PHASE',
      '_META',
      'PHASE-1',
      'PHASE 1',
      'PHASE:1',
      'PHASE.1',
    ]) {
      assert.strictEqual(isValidSectionName(name), false, `${name} should be invalid`);
    }
  });

  it('SECTION_NAME_REGEX is anchored', () => {
    assert.strictEqual(SECTION_NAME_REGEX.test('META\nEXTRA'), false);
  });
});

describe('extractSection — happy path', () => {
  it('extracts content between markers, excluding the marker lines', () => {
    const r = extractSection(TICKET, 'META');
    assert.strictEqual(r.status, 'ok');
    assert.strictEqual(
      r.status === 'ok' ? r.content : '',
      '- **Task-ID:** cli-foo\n- **Status:** [ ] TODO'
    );
  });

  it('extracts a different section independently', () => {
    const r = extractSection(TICKET, 'PHASE_P1');
    assert.strictEqual(r.status, 'ok');
    assert.match(r.status === 'ok' ? r.content : '', /### P1 — impl/);
    assert.doesNotMatch(r.status === 'ok' ? r.content : '', /Task-ID/);
  });

  it('tolerates leading indentation on marker lines', () => {
    const indented = ['  <!--SECTION:META-->', '    body line', '  <!--/SECTION:META-->'].join(
      '\n'
    );
    const r = extractSection(indented, 'META');
    assert.strictEqual(r.status, 'ok');
    assert.strictEqual(r.status === 'ok' ? r.content : '', '    body line');
  });

  it('preserves blank lines inside the block', () => {
    const src = ['<!--SECTION:META-->', 'a', '', 'b', '<!--/SECTION:META-->'].join('\n');
    const r = extractSection(src, 'META');
    assert.strictEqual(r.status === 'ok' ? r.content : '', 'a\n\nb');
  });
});

describe('extractSection — failure statuses', () => {
  it('invalid_name for a non-canonical name', () => {
    assert.strictEqual(extractSection(TICKET, 'meta').status, 'invalid_name');
  });

  it('not_found when neither marker is present', () => {
    assert.strictEqual(extractSection(TICKET, 'EXECUTION_LOG').status, 'not_found');
  });

  it('unbalanced when start has no matching end', () => {
    const src = ['<!--SECTION:META-->', 'orphan'].join('\n');
    const r = extractSection(src, 'META');
    assert.strictEqual(r.status, 'unbalanced');
    if (r.status === 'unbalanced') {
      assert.strictEqual(r.startCount, 1);
      assert.strictEqual(r.endCount, 0);
    }
  });

  it('unbalanced when end has no matching start', () => {
    const r = extractSection(['<!--/SECTION:META-->'].join('\n'), 'META');
    assert.strictEqual(r.status, 'unbalanced');
    if (r.status === 'unbalanced') {
      assert.strictEqual(r.startCount, 0);
      assert.strictEqual(r.endCount, 1);
    }
  });

  it('duplicated when the same section appears twice', () => {
    const src = [
      '<!--SECTION:META-->',
      'first',
      '<!--/SECTION:META-->',
      '<!--SECTION:META-->',
      'second',
      '<!--/SECTION:META-->',
    ].join('\n');
    const r = extractSection(src, 'META');
    assert.strictEqual(r.status, 'duplicated');
    if (r.status === 'duplicated') assert.strictEqual(r.count, 2);
  });

  it('empty when markers are present but blank between', () => {
    const src = ['<!--SECTION:META-->', '   ', '<!--/SECTION:META-->'].join('\n');
    assert.strictEqual(extractSection(src, 'META').status, 'empty');
  });

  it('empty when markers are immediately adjacent', () => {
    const src = ['<!--SECTION:META-->', '<!--/SECTION:META-->'].join('\n');
    assert.strictEqual(extractSection(src, 'META').status, 'empty');
  });
});

describe('findSectionBounds', () => {
  it('returns the marker line indices for a clean pair', () => {
    const bounds = findSectionBounds(TICKET, 'META');
    assert.deepStrictEqual(bounds, { openLine: 2, closeLine: 5 });
  });

  it('returns null when the section is absent', () => {
    assert.strictEqual(findSectionBounds(TICKET, 'EXECUTION_LOG'), null);
  });

  it('returns null for unbalanced or duplicated markers', () => {
    assert.strictEqual(findSectionBounds('<!--SECTION:META-->\nx', 'META'), null);
    const dup = [
      '<!--SECTION:META-->',
      'a',
      '<!--/SECTION:META-->',
      '<!--SECTION:META-->',
      'b',
      '<!--/SECTION:META-->',
    ].join('\n');
    assert.strictEqual(findSectionBounds(dup, 'META'), null);
  });

  it('returns null for an invalid name', () => {
    assert.strictEqual(findSectionBounds(TICKET, 'meta'), null);
  });
});
