// @file: Path-aware module facts, existing section links, and no-invention/unsafe-read boundaries.
// @spec: CLI-SDD-NEW
// @consumers: renderModuleAuthoringFacts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderModuleAuthoringFacts } from '../module-authoring-facts.ts';

function fixture(body: (root: string, parent: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'sdd-new-module-facts-'));
  const parent = join(root, 'specs/catalog/catalog.spec.md');
  mkdirSync(join(root, 'specs/catalog'), { recursive: true });
  try {
    body(root, parent);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('module authoring facts', () => {
  for (const [path, href] of [
    ['specs/catalog/cache-policy/cache-policy.spec.md', '../catalog.spec.md'],
    ['specs/catalog/data/cache-policy/cache-policy.spec.md', '../../catalog.spec.md'],
    ['custom/drafts/cache-policy.spec.md', '../../specs/catalog/catalog.spec.md'],
  ]) {
    it(`derives exact identifiers and links for ${path}`, () =>
      fixture((root, parent) => {
        writeFileSync(
          parent,
          '<!--SECTION:REQUIREMENTS-->\nCAT-REQ-7\n<!--/SECTION:REQUIREMENTS-->'
        );
        const text = renderModuleAuthoringFacts(path!, 'catalog', 'CATALOG-CACHE-POLICY', root);
        assert.ok(text.includes(`scope-spec link: [Scope](${href})`));
        assert.ok(text.includes(`[REQUIREMENTS](${href}#REQUIREMENTS)`));
        assert.match(text, /spec-id: CATALOG-CACHE-POLICY/);
        assert.match(text, /acronym: CP /);
        assert.match(text, /CP-REQ-1/);
        assert.match(text, /CP-DL-1 YYYY-MM-DD/);
        assert.match(text, /read-only, not local IDs\): CAT-REQ-7/);
        assert.match(text, /do not invent history/);
        assert.match(text, /compare\(scope Trigger\/When, local Trigger\/When, DbC Pre\/Post\)/);
        assert.match(text, /retain every input-domain qualifier/);
        assert.match(text, /only when the brief explicitly requires it/);
        assert.match(text, /one boundary witness for each changed condition/);
        assert.doesNotMatch(text, /foo|ASCII|TypeError|normalizeToken/);
      }));
  }
  it('never invents links/IDs when the scope spec is absent', () =>
    fixture((root) => {
      const text = renderModuleAuthoringFacts(
        'specs/catalog/search/search.spec.md',
        'catalog',
        'CATALOG-SEARCH',
        root
      );
      assert.match(text, /acronym: SEA /);
      assert.match(text, /unavailable\/unsafe/);
      assert.doesNotMatch(text, /\]\(|observed scope requirement IDs/);
    }));

  it('uses real canonical scope section names without rewriting the parent', () =>
    fixture((root, parent) => {
      const content =
        '<!--SECTION:REQUIREMENTS_AND_CONSTRAINTS-->\nCAT-REQ-1\n<!--/SECTION:REQUIREMENTS_AND_CONSTRAINTS-->\n<!--SECTION:PUBLIC_API_SURFACE-->\npublic()\n<!--/SECTION:PUBLIC_API_SURFACE-->';
      writeFileSync(parent, content);
      const text = renderModuleAuthoringFacts(
        'specs/catalog/search/search.spec.md',
        'catalog',
        'CATALOG-SEARCH',
        root
      );
      assert.match(text, /catalog\.spec\.md#REQUIREMENTS_AND_CONSTRAINTS/);
      assert.match(text, /catalog\.spec\.md#PUBLIC_API_SURFACE/);
      assert.match(text, /read-only, not local IDs\): CAT-REQ-1/);
      assert.equal(readFileSync(parent, 'utf8'), content);
    }));
  it('omits empty, missing and duplicate section anchors', () =>
    fixture((root, parent) => {
      const one = '<!--SECTION:REQUIREMENTS-->\nCAT-REQ-1\n<!--/SECTION:REQUIREMENTS-->';
      writeFileSync(
        parent,
        one + '\n' + one + '\n<!--SECTION:MODULE_MAP-->\n<!--/SECTION:MODULE_MAP-->'
      );
      const text = renderModuleAuthoringFacts(
        'specs/catalog/search/search.spec.md',
        'catalog',
        'CATALOG-SEARCH',
        root
      );
      assert.match(text, /scope-spec link/);
      assert.doesNotMatch(text, /#REQUIREMENTS|#MODULE_MAP|#PUBLIC_API|CAT-REQ-1/);
    }));
  it('bounds IDs and does not copy normative parent prose into the report', () =>
    fixture((root, parent) => {
      writeFileSync(
        parent,
        `<!--SECTION:REQUIREMENTS-->\nSECRET_DOMAIN_PROSE ${Array.from({ length: 25 }, (_, n) => `CAT-REQ-${n + 1}`).join(' ')}\n<!--/SECTION:REQUIREMENTS-->`
      );
      const text = renderModuleAuthoringFacts(
        'specs/catalog/search/search.spec.md',
        'catalog',
        'CATALOG-SEARCH',
        root
      );
      assert.match(text, /CAT-REQ-12/);
      assert.doesNotMatch(text, /CAT-REQ-13|SECRET_DOMAIN_PROSE/);
    }));
  for (const unsafe of ['symlink-file', 'symlink-dir', 'oversized', 'directory']) {
    it(`does not read an ${unsafe} parent`, () =>
      fixture((root, parent) => {
        if (unsafe === 'symlink-file') symlinkSync(join(root, 'outside'), parent);
        if (unsafe === 'symlink-dir') {
          rmSync(join(root, 'specs/catalog'), { recursive: true });
          symlinkSync(root, join(root, 'specs/catalog'));
        }
        if (unsafe === 'oversized') writeFileSync(parent, 'x'.repeat(256 * 1024 + 1));
        if (unsafe === 'directory') mkdirSync(parent);
        assert.match(
          renderModuleAuthoringFacts(
            'specs/catalog/search/search.spec.md',
            'catalog',
            'CATALOG-SEARCH',
            root
          ),
          /unavailable\/unsafe/
        );
      }));
  }
});
