// @file: Unit tests for detectSpecKind — v2 marker classification plus the legacy heading/title fallback.
// @consumers: spec-kind

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectSpecKind } from '../core/spec-kind.ts';

describe('detectSpecKind', () => {
  it('classifies a v2 module spec via MODULE_VISION marker', () => {
    assert.equal(
      detectSpecKind('<!--SECTION:MODULE_VISION-->\nx\n<!--/SECTION:MODULE_VISION-->'),
      'module'
    );
  });

  it('classifies a v2 scope spec via SCOPE_TYPE marker', () => {
    assert.equal(
      detectSpecKind('<!--SECTION:SCOPE_TYPE-->\nproduct\n<!--/SECTION:SCOPE_TYPE-->'),
      'scope'
    );
  });

  it('module wins when both markers are present (a module also carries its parent SCOPE_TYPE)', () => {
    const content =
      '<!--SECTION:SCOPE_TYPE-->\nproduct\n<!--/SECTION:SCOPE_TYPE-->\n' +
      '<!--SECTION:MODULE_VISION-->\nx\n<!--/SECTION:MODULE_VISION-->';
    assert.equal(detectSpecKind(content), 'module');
  });

  it('classifies a legacy module spec via numbered "Module Vision" heading', () => {
    const content = '# Module: orient\n\n## 1. Module Vision\ntext';
    assert.equal(detectSpecKind(content), 'module');
  });

  it('classifies a legacy module spec via "# Module:" title alone', () => {
    const content = '# Module: orient\n\n## 1. Something Else\ntext';
    assert.equal(detectSpecKind(content), 'module');
  });

  it('classifies a legacy scope spec via "## scope-type" heading', () => {
    const content = '# cli: Scope Specification\n\n## scope-type\n\nproduct\n\n## 1. Vision\ntext';
    assert.equal(detectSpecKind(content), 'scope');
  });

  it('returns unknown for content with neither signal', () => {
    assert.equal(detectSpecKind('# Some Doc\n\njust prose'), 'unknown');
  });

  it('is not fooled by "scope-type" appearing as prose, not a heading', () => {
    const content = '# Doc\n\nThe scope-type of this thing is unclear.';
    assert.equal(detectSpecKind(content), 'unknown');
  });
});
