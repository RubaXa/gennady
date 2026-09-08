// @file: One home per axiom (T-B6-18) — no id is defined both inline in a .hbs template AND as
//   a library file under ai/kit/axiom/**, and no id inlined in two or more .hbs templates escapes
//   being a shared partial.
// @consumers: node:test runner
// @tasks: T-B6-18

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { relative, sep } from 'node:path';
import { walk, KIT, TEMPLATES } from '../render.ts';

const AXIOM_LIBRARY_ROOT = `${KIT}${sep}axiom`;
const INLINE_AXIOM_ID = /<Axiom\s+id="(AX_[A-Z0-9_]+)"/g;

/** Every inline `<Axiom id="…">` definition found directly in .hbs template SOURCE (never inside
 * a `{{> "…"}}` partial call, which is text, not a literal Axiom tag) — file -> ids defined there. */
function inlineAxiomsByTemplate(): Map<string, Set<string>> {
  const byTemplate = new Map<string, Set<string>>();
  for (const t of walk(TEMPLATES, (p) => p.endsWith('.hbs'))) {
    const rel = relative(TEMPLATES, t).split(sep).join('/');
    const src = readFileSync(t, 'utf8');
    const ids = new Set<string>();
    for (const m of src.matchAll(INLINE_AXIOM_ID)) ids.add(m[1] as string);
    if (ids.size > 0) byTemplate.set(rel, ids);
  }
  return byTemplate;
}

/** Every id the axiom library defines (one `<Axiom id>` per file, by convention) -> library file path. */
function libraryHomes(): Map<string, string> {
  const homes = new Map<string, string>();
  for (const f of walk(AXIOM_LIBRARY_ROOT, (p) => p.endsWith('.xml'))) {
    const rel = relative(KIT, f).split(sep).join('/'); // e.g. 'axiom/process/ax-operator-language.xml'
    const src = readFileSync(f, 'utf8');
    const m = INLINE_AXIOM_ID.exec(src);
    INLINE_AXIOM_ID.lastIndex = 0; // shared global regex — reset between files
    if (m) homes.set(m[1] as string, rel);
  }
  return homes;
}

describe('axiom-home — no axiom id has two homes (T-B6-18)', () => {
  it('no id inlined in a template also has a library file defining the same id', () => {
    const inline = inlineAxiomsByTemplate();
    const library = libraryHomes();
    const violations: string[] = [];
    for (const [template, ids] of inline) {
      for (const id of ids) {
        const libraryFile = library.get(id);
        if (libraryFile) {
          violations.push(`${id}: inlined in ${template} AND defined in ${libraryFile}`);
        }
      }
    }
    assert.deepEqual(violations, [], `two-homes violation(s):\n${violations.join('\n')}`);
  });

  it('an axiom id inlined in two or more templates is a partial, not independent copies', () => {
    const inline = inlineAxiomsByTemplate();
    const library = libraryHomes();
    const templatesById = new Map<string, string[]>();
    for (const [template, ids] of inline) {
      for (const id of ids) {
        const list = templatesById.get(id) ?? [];
        list.push(template);
        templatesById.set(id, list);
      }
    }
    const violations: string[] = [];
    for (const [id, templates] of templatesById) {
      if (templates.length < 2) continue;
      if (library.has(id)) continue; // already flagged by the two-homes case above
      violations.push(`${id}: inlined independently in ${templates.length} templates (${templates.join(', ')}) — must be a shared partial`);
    }
    assert.deepEqual(violations, [], `multi-template inline violation(s):\n${violations.join('\n')}`);
  });
});
