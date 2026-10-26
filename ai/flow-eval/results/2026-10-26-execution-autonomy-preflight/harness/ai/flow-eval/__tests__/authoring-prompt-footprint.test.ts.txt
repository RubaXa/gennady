// @file: Exact envelope controls for the competing module instruction placements.
// @spec: AI-SKILLS
// @consumers: authoring-prompt-footprint

import assert from 'node:assert/strict';
import { it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { TEMPLATES } from '../../../shared/sdd/templates.ts';
import { measureAuthoringPromptFootprint } from '../authoring-prompt-footprint.ts';
const root = fileURLToPath(new URL('../../../', import.meta.url));
it('counts owner, local skeleton, actual manifest and all three unchanged external contracts', () => {
  const result = measureAuthoringPromptFootprint(root, 'module-flat')!;
  assert.equal(result.parts.length, 6);
  assert.equal(
    result.bytes,
    result.parts.reduce((sum, part) => sum + part.bytes, 0)
  );
  assert.deepEqual(result, measureAuthoringPromptFootprint(root, 'module-nested'));
  assert.equal(measureAuthoringPromptFootprint(root, 'portal'), undefined);
  assert.throws(() => measureAuthoringPromptFootprint('/missing', 'module-flat'), /missing/);
});
it('moving text into the skeleton does not hide its cost behind a smaller owner', () => {
  const original = TEMPLATES.module.skeleton;
  const before = measureAuthoringPromptFootprint(root, 'module-flat')!;
  try {
    TEMPLATES.module.skeleton += '\nExtra section instructions.\n';
    const after = measureAuthoringPromptFootprint(root, 'module-flat')!;
    assert.equal(after.bytes - before.bytes, Buffer.byteLength('\nExtra section instructions.\n'));
    assert.notEqual(after.digest, before.digest);
  } finally {
    TEMPLATES.module.skeleton = original;
  }
});
