// @file: Guards D2 (40-TRACK-DIRECTIVES-SKILLS.md §1.2, T-B6-15) — the agent reading AGENTS.md
//   must learn, before anything else, that ai/directives/**/*.xml is prompt markup for an LLM to
//   read, not an XML document, and must never run an XML parser/validator against it. v1 had this
//   as AGENTS.md's first section; v2 lost it (the fact survived only in ai/kit/AUTHORING.md §1, a
//   template-author document the operating agent does not read) until this fix restored it.
// @consumers: node:test runner
// @tasks: T-B6-15

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { PROJECT_ROOT } from '../render.ts';

const AGENTS_MD = readFileSync(join(PROJECT_ROOT, 'AGENTS.md'), 'utf8');

/** First-match index of a markdown heading whose text contains `needle` (case-insensitive), or -1. */
function headingIndex(text: string, needle: string): number {
  const re = new RegExp(`^#{1,6}\\s.*${needle}`, 'im');
  const m = re.exec(text);
  return m ? m.index : -1;
}

describe('AGENTS.md declares directive markup before the project description (D2, T-B6-15)', () => {
  it('both headings exist', () => {
    assert.notEqual(headingIndex(AGENTS_MD, 'Directive markup'), -1, 'no "Directive markup" heading found');
    assert.notEqual(headingIndex(AGENTS_MD, 'Project description'), -1, 'no "Project description" heading found');
  });

  it('"Directive markup" comes before "Project description"', () => {
    const markupIdx = headingIndex(AGENTS_MD, 'Directive markup');
    const descriptionIdx = headingIndex(AGENTS_MD, 'Project description');
    assert.ok(
      markupIdx >= 0 && descriptionIdx >= 0 && markupIdx < descriptionIdx,
      `expected "Directive markup" (index ${markupIdx}) before "Project description" (index ${descriptionIdx})`
    );
  });

  it('the section says ai/directives is not XML and forbids xmllint/validators', () => {
    const markupIdx = headingIndex(AGENTS_MD, 'Directive markup');
    const nextHeading = AGENTS_MD.slice(markupIdx + 1).search(/^##\s/m);
    const section = AGENTS_MD.slice(markupIdx, nextHeading === -1 ? undefined : markupIdx + 1 + nextHeading);
    assert.match(section, /ai\/directives/);
    assert.match(section, /not an? XML document/i);
    assert.match(section, /xmllint/);
  });
});

/** Every file under `dir` (recursively) whose name matches `ok`. */
function walk(dir: string, ok: (p: string) => boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === 'coverage') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p, ok));
    else if (ok(p)) out.push(p);
  }
  return out;
}

describe('no repository script invokes an XML validator over ai/directives (D2, T-B6-15)', () => {
  it('package.json scripts do not mention xmllint or an XML validator', () => {
    const pkg = readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf8');
    assert.doesNotMatch(pkg, /xmllint/i);
  });

  it('no file under scripts/** mentions xmllint or an XML validator', () => {
    const scriptsDir = join(PROJECT_ROOT, 'scripts');
    const offenders: string[] = [];
    for (const f of walk(scriptsDir, (p) => /\.(ts|js|mjs|sh)$/.test(p))) {
      if (/xmllint/i.test(readFileSync(f, 'utf8'))) offenders.push(relative(PROJECT_ROOT, f));
    }
    assert.deepEqual(offenders, [], `xmllint/validator reference(s) found: ${offenders.join(', ')}`);
  });
});
