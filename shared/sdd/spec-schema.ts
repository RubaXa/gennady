// @file: Read-only structural-schema diagnosis for SDD scope/module specs before scaffold.
// @consumers: sdd-state, sdd-scaffold
// @tasks: N/A

import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/** @purpose Current installed structural schema identifier emitted by sdd-state. */
export const SPEC_SCHEMA_VERSION = 'sdd-v2';

/** @purpose Canonical ordered structural fields shared by scope skeletons and diagnosis. */
export const BOOTSTRAP_REQUIREMENTS_COLUMNS = [
  'Requirement',
  'Kind',
  'Owner',
  'Resolution',
  'Readiness Gates',
  'Gate Artifacts',
] as const;

/** @purpose Canonical Markdown header and separator rendered by every scope skeleton. */
export const BOOTSTRAP_REQUIREMENTS_TABLE_HEADER = `| ${BOOTSTRAP_REQUIREMENTS_COLUMNS.join(' | ')} |\n|${BOOTSTRAP_REQUIREMENTS_COLUMNS.map(() => '---').join('|')}|`;

/** @purpose Closed diagnosis states consumed by router/scaffold preflight. */
export type SpecSchemaStatus = 'current' | 'invalid';

/** @purpose Diagnosis of one canonical scope or module spec. */
export type SpecSchemaFinding = {
  /** @purpose Repo-relative affected spec path. */
  path: string;
  /** @purpose Structurally identified artifact kind. */
  kind: 'scope' | 'module' | 'unknown';
  /** @purpose Closed pre-scaffold diagnosis. */
  status: SpecSchemaStatus;
  /** @purpose Exact observed structural mismatch or current schema id. */
  reason: string;
};

/** @purpose Whole-project schema report; any structural mismatch is invalid inside V2. */
export type SpecSchemaReport = {
  /** @purpose Structural-rule registry version. */
  version: string;
  /** @purpose Aggregate status; V2 has no internal migration state. */
  status: SpecSchemaStatus;
  /** @purpose Stable path-sorted per-spec diagnoses. */
  findings: SpecSchemaFinding[];
};

type TableRule = {
  section: string;
  current: readonly string[];
};

// V2 has one live structure. A different shape is invalid and returns to the owning authoring flow;
// only the separate V1→V2 flow is a migration.
const SCOPE_TABLE_RULES: readonly TableRule[] = [
  {
    section: 'BOOTSTRAP_REQUIREMENTS',
    current: BOOTSTRAP_REQUIREMENTS_COLUMNS,
  },
];

function sectionBodies(content: string, section: string): string[] {
  const open = `<!--SECTION:${section}-->`;
  const close = `<!--/SECTION:${section}-->`;
  const bodies: string[] = [];
  let cursor = 0;
  while (true) {
    const start = content.indexOf(open, cursor);
    if (start === -1) break;
    const end = content.indexOf(close, start + open.length);
    if (end === -1) return [];
    bodies.push(content.slice(start + open.length, end));
    cursor = end + close.length;
  }
  return bodies;
}

function tableHeaders(body: string): string[][] {
  const lines = body.split(/\r?\n/);
  const headers: string[][] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const header = lines[i]?.trim() ?? '';
    const separator = lines[i + 1]?.trim() ?? '';
    if (!header.startsWith('|') || !/^\|(?:\s*:?-+:?\s*\|)+$/.test(separator)) continue;
    headers.push(
      header
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.trim())
    );
  }
  return headers;
}

function sameColumns(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((value, i) => value === expected[i]);
}

function diagnoseScope(path: string, content: string): SpecSchemaFinding {
  for (const rule of SCOPE_TABLE_RULES) {
    const bodies = sectionBodies(content, rule.section);
    if (bodies.length !== 1)
      return {
        path,
        kind: 'scope',
        status: 'invalid',
        reason: `${rule.section} must have exactly one paired section; found ${bodies.length}`,
      };
    const headers = tableHeaders(bodies[0]!);
    if (headers.length !== 1)
      return {
        path,
        kind: 'scope',
        status: 'invalid',
        reason: `${rule.section} must contain exactly one structural table; found ${headers.length}`,
      };
    const actual = headers[0]!;
    if (sameColumns(actual, rule.current)) continue;
    return {
      path,
      kind: 'scope',
      status: 'invalid',
      reason: `${rule.section} columns are ambiguous: [${actual.join(', ')}]; expected [${rule.current.join(', ')}]`,
    };
  }
  return { path, kind: 'scope', status: 'current', reason: SPEC_SCHEMA_VERSION };
}

/**
 * @purpose Diagnose one scope/module spec against the installed structural-schema registry.
 * @param path Repo-relative spec path used in diagnostics.
 * @param content Full markdown content.
 * @returns Typed current or invalid finding.
 */
function diagnoseSpecSchema(path: string, content: string): SpecSchemaFinding {
  const scopeMarkers = sectionBodies(content, 'SCOPE_TYPE').length;
  const moduleMarkers = sectionBodies(content, 'MODULE_VISION').length;
  if (scopeMarkers === 1 && moduleMarkers === 0) return diagnoseScope(path, content);
  if (moduleMarkers === 1 && scopeMarkers === 0)
    return { path, kind: 'module', status: 'current', reason: SPEC_SCHEMA_VERSION };
  return {
    path,
    kind: 'unknown',
    status: 'invalid',
    reason: `artifact kind is ambiguous: SCOPE_TYPE=${scopeMarkers}, MODULE_VISION=${moduleMarkers}`,
  };
}

function collectSpecPaths(root: string, dir: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const absolute = join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) collectSpecPaths(root, absolute, out);
    else if (entry.isFile() && entry.name.endsWith('.spec.md'))
      out.push(relative(root, absolute).replaceAll('\\', '/'));
  }
}

/**
 * @purpose Diagnose every canonical scope/module spec without mutating it or reading implementation.
 * @param root Absolute project root.
 * @returns Stable path-sorted project report.
 */
export function diagnoseProjectSpecSchemas(root: string): SpecSchemaReport {
  const paths: string[] = [];
  collectSpecPaths(root, join(root, 'specs'), paths);
  const findings = paths.sort().map((path): SpecSchemaFinding => {
    const absolute = join(root, path);
    try {
      if (!lstatSync(absolute).isFile()) throw new Error('not a regular file');
      return diagnoseSpecSchema(path, readFileSync(absolute, 'utf-8'));
    } catch (cause) {
      return {
        path,
        kind: 'unknown',
        status: 'invalid',
        reason: `cannot read spec: ${cause instanceof Error ? cause.message : String(cause)}`,
      };
    }
  });
  const status: SpecSchemaStatus = findings.some((finding) => finding.status === 'invalid')
    ? 'invalid'
    : 'current';
  return { version: SPEC_SCHEMA_VERSION, status, findings };
}
