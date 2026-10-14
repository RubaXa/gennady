// @file: REL-16 anti-v1 lock for operator-facing README/skill/guide documentation.
// @spec: INFRA-BASE
// @consumers: test-topology (and therefore the full verification profile)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');

function docs(): Array<{ file: string; content: string }> {
  const files = [
    'README.md',
    'ai/skills/README.md',
    ...readdirSync(join(ROOT, 'guides'))
      .filter((name) => name.endsWith('.md'))
      .map((name) => `guides/${name}`),
  ];
  return files.map((file) => ({ file, content: readFileSync(join(ROOT, file), 'utf8') }));
}

describe('REL-16: public operational docs expose only the SDD v2 flow', () => {
  it('contains no retired v1 command, directive path, or bundled execute script', () => {
    const forbidden = [
      '/sdd-setup',
      '/sdd-discover',
      '/sdd-continue',
      '/sdd-infra',
      '/sdd-fix',
      '/sdd-execute-batch',
      'ai/directives/sdd/',
      'ai/skills/sdd-execute/scripts/',
      'verify.sh',
    ];
    const findings = docs().flatMap(({ file, content }) =>
      forbidden.filter((token) => content.includes(token)).map((token) => `${file}: ${token}`)
    );
    assert.deepEqual(findings, []);
  });

  it('teaches the fail-closed migration boundary before either sync command', () => {
    const rootReadme = readFileSync(join(ROOT, 'README.md'), 'utf8');
    const skillsReadme = readFileSync(join(ROOT, 'ai/skills/README.md'), 'utf8');
    const guide = readFileSync(join(ROOT, 'guides/v1-to-v2-migration.md'), 'utf8');
    for (const content of [rootReadme, skillsReadme, guide]) {
      assert.match(content, /tasks\//);
      assert.match(content, /до запис|before.*write/i);
    }
    assert.match(guide, /FLOW_VERSION=v2/);
    assert.match(guide, /\.gennady-synced/);
  });
});
