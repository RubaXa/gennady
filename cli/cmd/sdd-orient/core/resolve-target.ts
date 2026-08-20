// @file: Resolve the sdd-orient argument — a spec path, or a scope name via the portal — to a spec file. Mirrors ticket-resolve.ts's path-or-id shape.
// @consumers: SddOrientCommand

import { resolve, join } from 'node:path';
import { parseScopes, type Scope } from '../../../../shared/sdd/portal.ts';
import { fsSpecSectionSource, type SpecSectionSource } from './spec-section-source.ts';

/**
 * @purpose Outcome of resolving the sdd-orient argument, discriminated by `ok`/`reason`.
 * @invariant `ok: true` always carries the resolved absolute `path` + its `content`; every failure
 *   reason is distinct and actionable (mirrors `TicketResolution`'s shape in ticket-resolve.ts).
 */
export type OrientResolution =
  | { ok: true; path: string; content: string; resolvedFrom: 'path' }
  | { ok: true; path: string; content: string; resolvedFrom: 'scope'; scope: string }
  | { ok: false; reason: 'no-portal' }
  | { ok: false; reason: 'unknown-scope'; name: string; scopes: Scope[] }
  | { ok: false; reason: 'unreadable-scope-spec'; name: string; specPath: string };

/**
 * @purpose Resolve the sdd-orient argument — a `.spec.md` path, or a scope name via the portal.
 * @invariant Path wins first — a scope sharing a readable file's name would be ambiguous; a
 *   real path never looks like a scope name.
 * @param arg Raw CLI argument — a `.spec.md` path, or a bare scope name (`--scope` or positional).
 * @param root Absolute project root; the portal is read from `<root>/specs/README.md`.
 * @param [source] SpecSectionSource — defaults to the real filesystem; tests inject a fixture.
 * @returns The resolved path + content, or a typed failure reason.
 */
export function resolveOrientTarget(
  arg: string,
  root: string,
  source: SpecSectionSource = fsSpecSectionSource
): OrientResolution {
  const directPath = resolve(root, arg);
  const direct = source.read(directPath);
  if (direct !== null) return { ok: true, path: directPath, content: direct, resolvedFrom: 'path' };

  const portalPath = join(root, 'specs', 'README.md');
  const portalContent = source.read(portalPath);
  if (portalContent === null) return { ok: false, reason: 'no-portal' };

  const scopes = parseScopes(portalContent);
  const match = scopes.find((s) => s.name === arg);
  if (!match || !match.specPath) return { ok: false, reason: 'unknown-scope', name: arg, scopes };

  const scopePath = resolve(join(root, 'specs'), match.specPath);
  const scopeContent = source.read(scopePath);
  if (scopeContent === null) {
    return { ok: false, reason: 'unreadable-scope-spec', name: arg, specPath: scopePath };
  }
  return { ok: true, path: scopePath, content: scopeContent, resolvedFrom: 'scope', scope: arg };
}
