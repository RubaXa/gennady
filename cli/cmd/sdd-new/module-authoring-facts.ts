// @file: Bounded path-derived module authoring facts returned by sdd-new, never normative requirements.
// @spec: CLI-SDD-NEW
// @consumers: SddNewCommand

import { lstatSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { deriveSpecAcronym, REQ_ID_GRAMMAR } from '../../../shared/sdd/requirement-id.ts';
import { extractSection } from '../../../shared/sdd/section.ts';
import { ticketRelativeHref } from '../../../shared/sdd/task-authoring-literals.ts';

/**
 * @purpose Read at most one bounded regular scope spec without following symlink components.
 * @param root Working directory whose own files may be read.
 * @param path Scope spec path below root.
 * @returns Its text, or null when unavailable/unsafe; optional facts never invalidate a created file.
 */
function readScope(root: string, path: string): string | null {
  const rel = relative(resolve(root), resolve(root, path));
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`)) return null;
  try {
    let cursor = resolve(root);
    for (const part of rel.split(sep)) {
      cursor = join(cursor, part);
      const stat = lstatSync(cursor);
      if (stat.isSymbolicLink()) return null;
    }
    const stat = lstatSync(cursor);
    if (!stat.isFile() || stat.size > 256 * 1024) return null;
    return readFileSync(cursor, 'utf8');
  } catch {
    return null;
  }
}

/**
 * @purpose Return exact identifiers/link literals at creation time instead of requiring source archaeology.
 * @invariant No new requirement, approval, decision, parent content, or disk mutation is synthesized.
 * @param path Actual created module path, including an explicit --out.
 * @param scope Known owning scope; only its conventional spec is read.
 * @param specId Stable ID already written to the created skeleton.
 * @param [root] Working directory used to resolve the scope spec.
 * @returns Bounded copy-ready syntax and only links whose target sections exist unambiguously.
 */
export function renderModuleAuthoringFacts(
  path: string,
  scope: string,
  specId: string,
  root = process.cwd()
): string {
  const acronym = deriveSpecAcronym(path);
  const parentPath = `specs/${scope}/${scope}.spec.md`;
  const parent = readScope(root, parentPath);
  const href = ticketRelativeHref(path, parentPath);
  const lines = [
    'authoring-facts (computed; syntax examples are not authored requirements/decisions):',
    `  spec-id: ${specId}`,
    `  acronym: ${acronym} (from this file basename, not directory depth)`,
    `  requirement-id syntax: ${acronym}-REQ-1; further local numbers: 2, 3, ...`,
    `  decision-log syntax: ${acronym}-DL-1 YYYY-MM-DD — <decision> (почему: <criterion>; отвергнуто: <alternative>; риск: <risk>)`,
    '  Decision Log uses one line per actual decision, not Status/Recorded blocks; do not invent history.',
  ];
  if (parent === null) {
    lines.push(`  scope-spec unavailable/unsafe: ${parentPath}; no parent href or IDs inferred.`);
  } else {
    lines.push(`  scope-spec link: [Scope](${href}) (relative to the created file)`);
    for (const name of [
      'REQUIREMENTS',
      'REQUIREMENTS_AND_CONSTRAINTS',
      'MODULE_REQUIREMENTS',
      'MODULE_MAP',
      'PUBLIC_API_SURFACE',
    ]) {
      const section = extractSection(parent, name);
      if (section.status !== 'ok') continue;
      lines.push(`  scope ${name} link: [${name}](${href}#${name})`);
      if (name.includes('REQUIREMENTS')) {
        const ids = [...new Set(section.content.match(/\b[A-Z][A-Z0-9]*-REQ-[0-9]+\b/g) ?? [])]
          .filter((id) => REQ_ID_GRAMMAR.test(id))
          .slice(0, 12);
        if (ids.length)
          lines.push(
            `  observed scope requirement IDs (read-only, not local IDs): ${ids.join(', ')}`
          );
      }
    }
  }
  return lines.join('\n');
}
