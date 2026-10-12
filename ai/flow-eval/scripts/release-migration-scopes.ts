// @file: Committed migration-unit scope identity shared by collector and independent checker.
// @spec: AI-SKILLS
// @consumers: release-evidence-pack; release-evidence-pack-check; release migration acceptance

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import {
  ARCHIVE_ROOT,
  checkFrozenMain,
  readSafe,
} from '../../../scripts/main-carry-disposition.ts';
import { unitFilePath, unitStatus } from '../../../shared/sdd/migration-plan.ts';

function git(root: string, args: string[]): Buffer {
  const result = spawnSync('git', args, {
    cwd: root,
    timeout: 30_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
    throw new Error(
      `migration source Git failure: ${result.stderr?.toString() ?? result.error?.message}`
    );
  }
  return result.stdout;
}

/** @purpose Mirror a committed spec into its migration-unit path through the existing path owner. */
function migrationUnitGitPath(spec: string): string {
  return unitFilePath({
    specFile: spec.split('/').join(sep),
    scope: spec.split('/')[1],
    module: null,
    scopeType: null,
    lines: 0,
    mermaidCount: 0,
    anchors: [],
    headings: [],
    tickets: [],
    targetSections: [],
    foldSections: [],
  })
    .split(sep)
    .join('/');
}

/** @purpose Reconstruct scopes from the existing committed unit ledger, never directory presence alone. */
export function committedMigrationScopes(root: string, sourceCommit: string): string[] {
  if (!/^[0-9a-f]{40}$/.test(sourceCommit))
    throw new Error('migration sourceCommit must be full SHA');
  git(root, ['cat-file', '-e', `${sourceCommit}^{commit}`]);
  const entries = new Map(
    git(root, [
      'ls-tree',
      '-r',
      '-z',
      sourceCommit,
      '--',
      'migration',
      'specs',
      'scripts/main-carry-disposition.ts',
    ])
      .toString('utf8')
      .split('\0')
      .filter(Boolean)
      .map((entry) => {
        const match = /^(\d+) blob ([0-9a-f]{40})\t(.+)$/.exec(entry);
        if (!match) throw new Error(`invalid migration source tree entry: ${entry}`);
        return [match[3], { mode: match[1], oid: match[2] }] as const;
      })
  );
  function text(path: string): string {
    if (entries.get(path)?.mode !== '100644')
      throw new Error(`missing/unsafe migration contract: ${path}`);
    return git(root, ['show', `${sourceCommit}:${path}`]).toString('utf8');
  }
  const ledger = text('migration/README.md');
  const rows = [
    ...ledger.matchAll(
      /^\|\s*`(migration\/[^`]+\.migration\.md)`\s*\|\s*`(specs\/[^`]+\.md)`\s*\|[^\n]*\|\s*$/gmu
    ),
  ];
  if (rows.length === 0) throw new Error('migration unit ledger is empty');
  const plans = new Set<string>();
  const scopes = new Set<string>();
  for (const [, plan, spec] of rows) {
    const parts = spec.split('/');
    if (
      parts.length < 3 ||
      spec.includes('\\') ||
      /[\u0000-\u001f\u007f]/u.test(spec) ||
      parts.some((part) => !part || part === '.' || part === '..') ||
      !/\.(?:spec|1-spec)\.md$/.test(spec)
    ) {
      throw new Error(`invalid migration unit spec: ${spec}`);
    }
    const scope = parts[1];
    if (`migration/${scope}` === ARCHIVE_ROOT)
      throw new Error('inert archive cannot be a migration unit');
    const expected = migrationUnitGitPath(spec);
    if (plan !== expected || plans.has(plan))
      throw new Error(`invalid/duplicate migration unit: ${plan}`);
    text(spec);
    const content = text(plan);
    const declaredScope = /^- \*\*Scope:\*\* ([^|\n]+)(?:\|[^\n]*)?$/mu.exec(content)?.[1].trim();
    if (
      !content.startsWith(`# План миграции: ${spec}\n`) ||
      unitStatus(content) === null ||
      declaredScope !== scope
    )
      throw new Error(`malformed migration unit: ${plan}`);
    for (const section of ['INVENTORY', 'SECTION_MAP', 'TICKET_MAP', 'DIAGRAM_PLAN', 'STEPS']) {
      const match = new RegExp(
        `<!--SECTION:${section}-->([\\s\\S]*?)<!--/SECTION:${section}-->`,
        'u'
      ).exec(content);
      if (!match?.[1].trim())
        throw new Error(`empty/missing migration unit section ${section}: ${plan}`);
    }
    plans.add(plan);
    scopes.add(scope);
  }
  const directories = new Set<string>();
  for (const [path, entry] of entries) {
    if (!path.startsWith('migration/')) continue;
    if (entry.mode !== '100644') throw new Error(`missing/unsafe migration contract: ${path}`);
    const parts = path.split('/');
    if (parts.length > 2) directories.add(parts[1]);
    if (path.endsWith('.migration.md') && !plans.has(path))
      throw new Error(`unlisted migration unit: ${path}`);
  }
  for (const path of entries.keys()) {
    const parts = path.split('/');
    if (
      parts[0] === 'specs' &&
      parts.length >= 3 &&
      /\.(?:spec|1-spec)\.md$/u.test(path) &&
      !scopes.has(parts[1])
    ) {
      throw new Error(`source spec scope has no migration units: ${parts[1]}`);
    }
  }
  // The canonical checker and archive were introduced atomically. Older evidence sources
  // predate both; a source with that checker cannot silently lose the complete archive.
  const archiveChecker = entries.get('scripts/main-carry-disposition.ts');
  if (archiveChecker && (archiveChecker.mode !== '100644' || !directories.has('frozen-main'))) {
    throw new Error('source archive required by canonical integrity checker');
  }
  for (const scope of directories) {
    if (scopes.has(scope)) continue;
    if (`migration/${scope}` !== ARCHIVE_ROOT)
      throw new Error(`unknown migration directory: ${scope}`);
    checkFrozenMain(root);
    const sourceArchive = [...entries.keys()]
      .filter((path) => path.startsWith(`${ARCHIVE_ROOT}/`))
      .sort();
    const liveArchive = [
      `${ARCHIVE_ROOT}/README.md`,
      `${ARCHIVE_ROOT}/dispositions.json`,
      `${ARCHIVE_ROOT}/manifest.json`,
      ...readdirSync(join(root, ARCHIVE_ROOT, 'objects')).map(
        (name) => `${ARCHIVE_ROOT}/objects/${name}`
      ),
    ].sort();
    if (
      sourceArchive.length !== liveArchive.length ||
      sourceArchive.some((path, index) => path !== liveArchive[index])
    ) {
      throw new Error('source archive inventory drift');
    }
    // Integrity alone proves the live archive. Bind its complete bytes/modes to this source too.
    for (const [path, entry] of entries) {
      if (!path.startsWith(`${ARCHIVE_ROOT}/`)) continue;
      const bytes = readSafe(root, path);
      const oid = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
      if (entry.mode !== '100644' || oid !== entry.oid)
        throw new Error(`source archive drift: ${path}`);
    }
  }
  return [...scopes].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
