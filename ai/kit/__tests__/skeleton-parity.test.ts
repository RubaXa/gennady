// @file: Drift guard — every rendered ai/directives/sdd-v2/formats/<kind>-*.xml embeds the literal
// skeleton from shared/sdd/templates.ts verbatim (indented one UNIT). Catches divergence between the
// registry (single source of truth) and either the kit contract source or the generated output.
// @consumers: node:test runner
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRenderer, TEMPLATES as KIT_TEMPLATES, UNIT } from '../render.ts';
import { TEMPLATES, type ArtifactKind } from '../../../shared/sdd/templates.ts';

/** hbs template (under ai/kit/templates/sdd-v2/formats) that renders each artifact kind's spec-structure contract. */
const FORMAT_HBS: Record<ArtifactKind, string> = {
  product: 'product-spec-structure.hbs',
  library: 'library-spec-structure.hbs',
  infrastructure: 'infrastructure-spec-structure.hbs',
  interface: 'interface-spec-structure.hbs',
  module: 'module-spec-structure.hbs',
  task: 'task-ticket-structure.hbs',
  'module-index': 'module-tasks-index.hbs',
  'scope-index': 'scope-tasks-index.hbs',
  'project-index': 'project-tasks-index.hbs',
  portal: 'portal-structure.hbs',
};

/** Prefix every non-blank line with one UNIT of indent — how a skeleton sits inside its Contract's markdown fence. */
const indentOneUnit = (text: string): string =>
  text
    .replace(/\n+$/, '')
    .split('\n')
    .map((l) => (l === '' ? '' : UNIT + l))
    .join('\n');

const { render } = createRenderer();

describe('skeleton parity — generated directive embeds the templates.ts registry skeleton verbatim', () => {
  for (const [kind, hbsName] of Object.entries(FORMAT_HBS) as [ArtifactKind, string][]) {
    it(`sdd-v2/formats/${hbsName.replace(/\.hbs$/, '.xml')} contains TEMPLATES.${kind}.skeleton`, () => {
      const src = readFileSync(join(KIT_TEMPLATES, 'sdd-v2', 'formats', hbsName), 'utf8');
      const rendered = render(src);
      const expected = indentOneUnit(TEMPLATES[kind].skeleton);
      assert.ok(
        rendered.includes(expected),
        `rendered sdd-v2/formats/${hbsName} does not contain TEMPLATES.${kind}.skeleton verbatim (indented ${UNIT.length} spaces)`
      );
    });
  }
});
