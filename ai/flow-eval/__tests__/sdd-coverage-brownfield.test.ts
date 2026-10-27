// @file: No-model existing-project coverage controls; real files, baseline adapter and owned cleanup.
// @spec: AI-SKILLS
// @consumers: SDD coverage pre-integration qualification

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { resolveSddCoverage } from '../../../shared/sdd/coverage.ts';
import type { CoverageInput } from '../../../shared/sdd/coverage.types.ts';
import { extractHeader } from '../../../cli/cmd/orient/core/extract-header.ts';
import { resolveOrientFileRelations } from '../../../cli/cmd/orient/core/resolve-file-relations.ts';

test('real headerless files reproduce the current adapter wall while the core permits only preparation', () => {
  const root = mkdtempSync(join(tmpdir(), 'gennady-coverage-control-'));
  const digest = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
  try {
    mkdirSync(join(root, 'src'));
    mkdirSync(join(root, 'specs/core'), { recursive: true });
    writeFileSync(
      join(root, 'specs/core/core.spec.md'),
      '<!--SECTION:SPEC_ID-->\nCORE\n<!--/SECTION:SPEC_ID-->\n'
    );
    writeFileSync(join(root, 'src/value.ts'), 'export const value = 7;\n');
    writeFileSync(join(root, 'src/unrelated.ts'), 'export const unrelated = true;\n');
    const untouched = digest(join(root, 'src/unrelated.ts'));
    const before = readFileSync(join(root, 'src/value.ts'), 'utf8');
    const baseline = resolveOrientFileRelations(
      root,
      join(root, 'src/value.ts'),
      extractHeader(before)
    );
    assert.ok(
      baseline.findings.some((finding) => finding.code === 'SDD_FILE_SPEC_OWNER_UNRESOLVED')
    );
    const input: CoverageInput = {
      stage: 'preflight',
      selection: { kind: 'phase', task: 'CORE-work', phase: 'P1' },
      specs: [
        { id: 'CORE', path: 'specs/core/core.spec.md', children: [], files: ['src/value.ts'] },
      ],
      targets: [
        {
          task: 'CORE-work',
          phase: 'P1',
          specId: 'CORE',
          path: 'src/value.ts',
          operation: 'write',
        },
      ],
      observations: [{ path: 'src/value.ts', state: 'file', specIds: [] }],
    };
    assert.equal(resolveSddCoverage(input).canProceed, true);
    assert.equal(resolveSddCoverage(input).complete, false);
    assert.equal(resolveSddCoverage({ ...input, stage: 'phase-exit' }).canProceed, false);
    // This is a host reference action, not a claim that a model or installed CLI performed it.
    writeFileSync(join(root, 'src/value.ts'), `// @spec: CORE\n${before}`);
    const header = extractHeader(readFileSync(join(root, 'src/value.ts'), 'utf8'));
    assert.equal(
      resolveSddCoverage({
        ...input,
        stage: 'phase-exit',
        observations: [{ path: 'src/value.ts', state: 'file', specIds: [header.spec as string] }],
      }).complete,
      true
    );
    assert.equal(digest(join(root, 'src/unrelated.ts')), untouched);
    assert.equal(existsSync(join(root, 'node_modules')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  assert.equal(existsSync(root), false);
});
