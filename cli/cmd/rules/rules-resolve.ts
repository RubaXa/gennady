// @file: Explicit-scope RuleSnapshot composition for the read-only rules CLI.
// @spec: CLI-RULES-CLI
// @consumers: rules.cmd

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import { validateTicketReviewPaths } from '../../../shared/sdd/audit-group.ts';
import { inspectRepoPath } from '../../../shared/common/repo-path.ts';
import { extractSection } from '../../../shared/sdd/section.ts';
import { parsePhaseDetail, parsePhasesOverview } from '../../../shared/sdd/ticket.ts';
import { resolveTicketArg } from '../../../shared/sdd/ticket-resolve.ts';
import { resolveSddRuleSnapshot } from '../../../shared/rules/sdd-rule-snapshot.ts';
import { resolveProjectSddVerifySelector } from '../../../shared/verify/planning/resolve-multistack.ts';
import type { RulesInvocation, RulesReport } from './rules.types.ts';

type ResolveInvocation = Extract<RulesInvocation, { readonly command: 'resolve' }>;
type RulesResolveReport = Extract<RulesReport, { readonly schema: 'gennady.rules-resolve.v1' }>;
type RulesResolveSelection = RulesResolveReport['selected']['required'][number];

type ResolvedRuleScope = {
  readonly targetFiles: readonly string[];
  readonly plannedFiles: readonly string[];
  readonly tombstoneFiles: readonly string[];
  readonly declaredSources?: readonly string[];
  readonly declarationFile?: string;
  readonly declarationProvenance?: string;
  readonly intent: string;
  readonly projection: RulesResolveReport['scope'];
};

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function unique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort(compare));
}

function fail(code: string, detail: string): never {
  throw new Error(`${code}: ${detail}`);
}

function globInput(value: string): boolean {
  return /[*?[\]{}]/.test(value);
}

function validateInput(value: string): void {
  if (
    value === '' ||
    value !== value.trim() ||
    value.startsWith('!') ||
    path.isAbsolute(value) ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    value.includes('\\') ||
    /[\0\r\n]/.test(value) ||
    value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    fail('RULES_SCOPE_UNSAFE', value);
  }
}

function filesScope(root: string, inputs: readonly string[], phase: string): ResolvedRuleScope {
  const selected: string[] = [];
  for (const input of inputs) {
    validateInput(input);
    const matches = globInput(input)
      ? fg.sync(input, {
          cwd: root,
          dot: true,
          onlyFiles: true,
          unique: true,
          followSymbolicLinks: false,
          suppressErrors: false,
        })
      : [input];
    if (matches.length === 0) fail('RULES_SCOPE_EMPTY_GLOB', input);
    for (const match of matches) {
      const inspected = inspectRepoPath(root, match, 'file');
      if (!inspected.ok) fail('RULES_SCOPE_UNSAFE', `${match}: ${inspected.detail}`);
      selected.push(inspected.relative);
    }
  }
  const files = unique(selected);
  if (files.length === 0) fail('RULES_SCOPE_REQUIRED', '--files resolved no files');
  return {
    targetFiles: files,
    plannedFiles: files,
    tombstoneFiles: [],
    intent: phase,
    projection: { source: 'files', files, tombstones: [] },
  };
}

function exactChangedBase(value: string): boolean {
  if (
    value === '@' ||
    value.startsWith('-') ||
    value.startsWith('/') ||
    value.endsWith('/') ||
    value.includes('//') ||
    value.includes('..') ||
    value.includes('@{') ||
    /[\0-\x20\x7f~^:?*[\]\\]/.test(value)
  ) {
    return false;
  }
  return value
    .split('/')
    .every(
      (component) =>
        component.length > 0 &&
        !component.startsWith('.') &&
        !component.endsWith('.') &&
        !component.endsWith('.lock')
    );
}

function git(root: string, operation: string, args: readonly string[]): string {
  const child = spawnSync('git', ['-C', root, ...args], {
    encoding: 'buffer',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (child.status !== 0 || child.error !== undefined) {
    const stderr = child.error?.message ?? child.stderr.toString('utf8').trim();
    fail('RULES_SCOPE_GIT_FAILED', `${operation}: ${stderr || `exit ${String(child.status)}`}`);
  }
  return child.stdout.toString('utf8');
}

function changedScope(root: string, ref: string, phase: string): ResolvedRuleScope {
  if (!exactChangedBase(ref)) fail('RULES_SCOPE_INVALID_REF', ref);
  git(root, 'resolve changed-from commit', [
    'rev-parse',
    '--verify',
    '--end-of-options',
    `${ref}^{commit}`,
  ]);
  const fields = git(root, 'resolve changed file scope', [
    'diff',
    '--name-status',
    '--no-renames',
    '-z',
    ref,
    '--',
  ]).split('\0');
  const existing: string[] = [];
  const tombstones: string[] = [];
  for (let index = 0; index < fields.length - 1; index += 2) {
    const status = fields[index] ?? '';
    const file = fields[index + 1] ?? '';
    if (status === '' || file === '') continue;
    validateInput(file);
    if (status.startsWith('D')) tombstones.push(file);
    else {
      const inspected = inspectRepoPath(root, file, 'file');
      if (!inspected.ok) fail('RULES_SCOPE_UNSAFE', `${file}: ${inspected.detail}`);
      existing.push(inspected.relative);
    }
  }
  for (const file of git(root, 'resolve untracked changed scope', [
    'ls-files',
    '--others',
    '--exclude-standard',
    '-z',
  ])
    .split('\0')
    .filter(Boolean)) {
    validateInput(file);
    const inspected = inspectRepoPath(root, file, 'file');
    if (!inspected.ok) fail('RULES_SCOPE_UNSAFE', `${file}: ${inspected.detail}`);
    existing.push(inspected.relative);
  }
  const files = unique(existing);
  const deleted = unique(tombstones);
  if (files.length === 0 && deleted.length === 0) {
    fail('RULES_SCOPE_EMPTY_DIFF', ref);
  }
  return {
    targetFiles: files,
    plannedFiles: files,
    tombstoneFiles: deleted,
    intent: phase,
    projection: {
      source: 'changed-from',
      files: unique([...files, ...deleted]),
      tombstones: deleted,
      changedFrom: ref,
    },
  };
}

function ticketScope(root: string, ticket: string, selector: string): ResolvedRuleScope {
  const resolved = resolveTicketArg(ticket, root);
  if (!resolved.ok) {
    const detail = 'detail' in resolved ? resolved.detail : resolved.reason;
    fail('RULES_SCOPE_TICKET_UNREADABLE', `${ticket}: ${detail}`);
  }
  const overview = extractSection(resolved.content, 'PHASES_OVERVIEW');
  if (overview.status !== 'ok') fail('RULES_SCOPE_TICKET_INVALID', 'missing PHASES_OVERVIEW');
  const phases = parsePhasesOverview(overview.content);
  const candidates: Array<{
    readonly index: number;
    readonly phase: (typeof phases)[number];
    readonly detail: ReturnType<typeof parsePhaseDetail>;
  }> = [];
  for (const [index, phase] of phases.entries()) {
    const section = extractSection(resolved.content, `PHASE_${phase.id}`);
    if (section.status !== 'ok') {
      fail('RULES_SCOPE_TICKET_INVALID', `missing PHASE_${phase.id}`);
    }
    const detail = parsePhaseDetail(section.content);
    const files = unique([...detail.targetFiles, ...detail.deletedFiles]);
    let mapped: ReturnType<typeof resolveProjectSddVerifySelector>;
    try {
      mapped = resolveProjectSddVerifySelector(root, phase.kind, {
        scope: { mode: 'files', files },
      });
    } catch (cause) {
      fail(
        'RULES_SCOPE_SELECTOR_UNRESOLVED',
        `${phase.id}: ${cause instanceof Error ? cause.message : String(cause)}`
      );
    }
    if (mapped.selector === selector) candidates.push({ index, phase, detail });
  }
  if (candidates.length === 0) {
    fail('RULES_SCOPE_SELECTOR_UNDECLARED', `${selector}: ${ticket}`);
  }
  if (candidates.length > 1) {
    fail(
      'RULES_SCOPE_TASK_AMBIGUOUS',
      `${selector}: ${candidates.map(({ phase }) => phase.id).join(', ')}`
    );
  }
  const candidate = candidates[0]!;
  const validated = validateTicketReviewPaths(root, resolved.content, {
    phaseIds: [candidate.phase.id],
    targetExpectation: 'existing',
    deletedPhaseIds: phases.slice(0, candidate.index + 1).map(({ id }) => id),
    handoffPhaseIds: [],
  });
  if (!validated.ok) {
    fail('RULES_SCOPE_TICKET_INVALID', `${validated.path}: ${validated.detail}`);
  }
  const ticketPath = path.relative(root, resolved.path).split(path.sep).join('/');
  const targetFiles = unique(validated.paths.targets);
  const tombstoneFiles = unique(validated.paths.deleted);
  return {
    targetFiles,
    plannedFiles: targetFiles,
    tombstoneFiles,
    declaredSources: candidate.detail.rules,
    declarationFile: ticketPath,
    declarationProvenance: `${ticketPath}#PHASE_${candidate.phase.id}.Rules`,
    intent: candidate.phase.kind,
    projection: {
      source: 'task',
      files: unique([...targetFiles, ...tombstoneFiles]),
      tombstones: tombstoneFiles,
      ticket: ticketPath,
      sddPhase: candidate.phase.id,
    },
  };
}

function selection(
  entry: ReturnType<typeof resolveSddRuleSnapshot>['snapshot']['required'][number]
): RulesResolveSelection {
  return Object.freeze({
    id: entry.id,
    type: entry.type,
    source: entry.source,
    bodyDigest: entry.bodyDigest,
    dependencies: entry.dependencies,
    via: entry.via,
    reason: entry.reason,
    provenance: entry.provenance,
    matchedArtifacts: entry.matchedArtifacts,
  });
}

/**
 * @purpose Resolve one explicit safe scope through the exact SDD RuleSnapshot composition root.
 * @param root Exact repository root whose inert facts and prompt sources may be read.
 * @param invocation Strict selector plus exactly one scope source.
 * @returns Stable explanation and the canonical immutable snapshot digest.
 */
export function resolveRules(root: string, invocation: ResolveInvocation): RulesResolveReport {
  const canonicalRoot = fs.realpathSync(root);
  const scope =
    invocation.scope.source === 'files'
      ? filesScope(canonicalRoot, invocation.scope.inputs, invocation.phase)
      : invocation.scope.source === 'changed-from'
        ? changedScope(canonicalRoot, invocation.scope.ref, invocation.phase)
        : ticketScope(canonicalRoot, invocation.scope.ticket, invocation.phase);
  const dispatch = resolveSddRuleSnapshot({
    root: canonicalRoot,
    targetFiles: scope.targetFiles,
    plannedFiles: scope.plannedFiles,
    tombstoneFiles: scope.tombstoneFiles,
    intents: [scope.intent],
    ...(scope.declaredSources === undefined ? {} : { declaredSources: scope.declaredSources }),
    ...(scope.declarationFile === undefined ? {} : { declarationFile: scope.declarationFile }),
    ...(scope.declarationProvenance === undefined
      ? {}
      : { declarationProvenance: scope.declarationProvenance }),
  });
  const required = Object.freeze(dispatch.snapshot.required.map(selection));
  const suggested = Object.freeze(dispatch.snapshot.suggested.map(selection));
  return Object.freeze({
    schema: 'gennady.rules-resolve.v1',
    phase: invocation.phase,
    scope: scope.projection,
    facts: dispatch.facts,
    selected: Object.freeze({ required, suggested }),
    skipped: Object.freeze(dispatch.snapshot.skipped.map((entry) => Object.freeze({ ...entry }))),
    dependencyClosure: Object.freeze(
      [...required, ...suggested]
        .filter((entry) => entry.via === 'dependency')
        .map((entry) => entry.id)
        .sort(compare)
    ),
    digest: dispatch.snapshot.digest,
  });
}
