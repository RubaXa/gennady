// @file: Regression fixtures for pre-scaffold structural-schema diagnosis.
// @consumers: spec-schema
// @tasks: N/A

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { diagnoseProjectSpecSchemas } from '../spec-schema.ts';

const roots: string[] = [];

const wrap = (
  table: string
): string => `<!--SECTION:SCOPE_TYPE-->\nproduct\n<!--/SECTION:SCOPE_TYPE-->
<!--SECTION:BOOTSTRAP_REQUIREMENTS-->\n## Prerequisites\n${table}\n<!--/SECTION:BOOTSTRAP_REQUIREMENTS-->`;

function diagnose(content: string) {
  const root = mkdtempSync(join(tmpdir(), 'spec-schema-'));
  roots.push(root);
  const dir = join(root, 'specs', 'app');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'app.spec.md'), content);
  return diagnoseProjectSpecSchemas(root).findings[0]!;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('spec structural schema', () => {
  it('classifies the draft.52 four-column Bootstrap Requirements fixture as stale-migratable', () => {
    const finding = diagnose(
      wrap('| Requirement | Kind | Owner | Resolution |\n|---|---|---|---|')
    );
    assert.strictEqual(finding.status, 'stale-migratable');
    assert.match(finding.reason, /Readiness Gates, Gate Artifacts/);
  });

  it('classifies the current six-column fixture as current', () => {
    const finding = diagnose(
      wrap(
        '| Requirement | Kind | Owner | Resolution | Readiness Gates | Gate Artifacts |\n|---|---|---|---|---|---|'
      )
    );
    assert.strictEqual(finding.status, 'current');
  });

  it('fails closed on an unregistered or ambiguous structural shape', () => {
    const finding = diagnose(wrap('| Requirement | Owner | Mystery |\n|---|---|---|'));
    assert.strictEqual(finding.status, 'invalid');
    assert.match(finding.reason, /ambiguous/);
  });
});
