// @file: Contract guards that every requirements amplifier writes the one flat requirement model.
// @consumers: SDD v2 directive build
// @tasks: N/A

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const read = (...parts: string[]): string => readFileSync(join(ROOT, ...parts), 'utf8');
const AMPLIFIERS = ['nfr', 'security', 'observability'] as const;

describe('requirements amplifiers use the canonical flat model', () => {
  for (const name of AMPLIFIERS) {
    const source = read('ai', 'kit', 'templates', 'sdd-v2', `amplify-${name}.directive.hbs`);

    it(`${name}: writes atomic IDs through the skeleton-owned requirement grammar`, () => {
      assert.doesNotMatch(source, /formats\/requirement-entry-format\.xml/);
      assert.match(source, /Requirements section's embedded grammar/);
      assert.match(source, /next unused sequential `<ACR>-REQ-<N>` IDs/);
      assert.match(source, /`Constraint`, `Verification`, and `Trace` lines/);
      assert.match(source, /one ordinary flat\s+entry per accepted observable outcome/);
    });

    it(`${name}: has one approval and never writes a legacy nested schema`, () => {
      assert.doesNotMatch(source, /formats\/(?:nfr-budgets|security-section)-format\.xml/);
      assert.match(source, /already-approved edit/);
      assert.match(source, /do not leave a mixed representation or ask for a second approval/);
      assert.match(source, /Never\s+create `### (?:Non-Functional Constraints|Security|Observability)`/);
    });

    it(`${name}: keeps optional detail outside Requirements and lazy`, () => {
      assert.match(source, /belongs in Architecture by default/);
      assert.match(source, /one explicitly\s+named supporting section outside Requirements only when the detail is genuinely needed/);
      assert.match(source, /link it from `Trace`/);
    });
  }

  it('the shared format grandfathers old specs but forbids mixed old/new authoring', () => {
    const contract = read('ai', 'kit', 'contract', 'spec', 'requirement-entry-format.xml');
    assert.match(contract, /Requirements is one flat sequence of entries/);
    assert.match(contract, /stays valid while it is left in that\s+legacy representation/);
    assert.match(contract, /migrate the whole Requirements section in the same edit/);
    assert.match(contract, /Never leave a mixed old\/new Requirements section/);
    assert.match(contract, /not a request for a validator exception/);
  });

  it('old NFR/security schemas are explicitly read/migration-only', () => {
    for (const name of ['nfr-budgets-format.xml', 'security-section-format.xml']) {
      const contract = read('ai', 'kit', 'contract', 'spec', name);
      assert.match(contract, /Legacy read\/migration shape only/);
      assert.match(contract, /Current amplifiers MUST NOT write this subsection/);
      assert.match(contract, /REQUIREMENT_ENTRY_FORMAT/);
    }
  });
});
