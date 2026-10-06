// @file: UV-27A deterministic V1-only SDD surface inventory and eradication gate.
// @spec: INFRA-BASE
// @consumers: package audit:v1-eradication, pre-commit, UV-27B cutover candidate binding

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

type Classification =
  | 'canonical-v2'
  | 'required-v1-to-v2-migration-boundary'
  | 'historical-test-evidence'
  | 'unrelated-product-version';

type Marker = { id: string; literal?: string; pattern?: string };
type ProtectedPath = {
  path: string;
  classification: Classification;
  requiredLiteral: string;
};
type Classifier = {
  path?: string;
  prefix?: string;
  pattern?: string;
  classification: Classification;
  reason: string;
};
type MarkerContext = {
  pathPattern: string;
  kind: 'source-provenance-comment';
};
type MarkerConstraint = {
  markerId: string;
  forbiddenClassifications: Classification[];
  allowContexts?: MarkerContext[];
};
type Policy = {
  schemaVersion: 'gennady.v1-eradication-policy.v1';
  markers: Marker[];
  forbiddenPaths: string[];
  protectedPaths: ProtectedPath[];
  classifiers: Classifier[];
  markerConstraints: MarkerConstraint[];
  excludedInventoryPaths: string[];
  expectedInventoryDigest: string;
  expectedCounts: Partial<Record<Classification, number>>;
};
type Entry = {
  path: string;
  classification: Classification;
  markers: string[];
  reason: string;
  protected: boolean;
};
type Finding = { code: string; path: string; detail: string };

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;
const CLASSIFICATIONS: readonly Classification[] = [
  'canonical-v2',
  'required-v1-to-v2-migration-boundary',
  'historical-test-evidence',
  'unrelated-product-version',
];
const ACTIVE_CLASSIFICATIONS: readonly Classification[] = [
  'canonical-v2',
  'unrelated-product-version',
];
const REQUIRED_ACTIVE_REFERENCE_MARKERS = new Map<string, { literal?: string; pattern?: string }>([
  ['old-directive-path', { literal: 'ai/directives/sdd/' }],
  ['old-skill-script-path', { literal: 'ai/skills/sdd-execute/scripts/' }],
  [
    'retired-skill-path',
    {
      pattern:
        'ai/skills/sdd-(?:setup|discover|continue|infra|module-decomposition|fix|execute-batch)(?:/|\\b)',
    },
  ],
  ['old-whole-project-runner', { literal: 'sdd-verify --profile' }],
]);
const ALLOWED_INVENTORY_EXCLUSIONS = new Set([
  'scripts/check-v1-eradication.ts',
  'scripts/v1-eradication.policy.json',
  'scripts/__tests__/v1-eradication.test.ts',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  owner: string
): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0)
    throw new Error(`${owner} has unknown key(s): ${unexpected.join(', ')}`);
}

function nonEmptyString(value: unknown, owner: string): string {
  if (typeof value !== 'string' || value.trim() === '' || /[\u0000-\u001f\u007f]/u.test(value))
    throw new Error(`${owner} must be a non-empty control-free string`);
  return value;
}

function classification(value: unknown, owner: string): Classification {
  if (!CLASSIFICATIONS.includes(value as Classification))
    throw new Error(`${owner} has unknown classification: ${String(value)}`);
  return value as Classification;
}

function regexp(pattern: string, owner: string): RegExp {
  let compiled: RegExp;
  try {
    compiled = new RegExp(pattern, 'u');
  } catch (error) {
    throw new Error(
      `${owner} has invalid regex: ${error instanceof Error ? error.message : error}`
    );
  }
  if (compiled.test('')) throw new Error(`${owner} regex must not match the empty string`);
  return compiled;
}

function objectArray(value: unknown, owner: string): Record<string, unknown>[] {
  if (!Array.isArray(value) || !value.every(isRecord))
    throw new Error(`${owner} must be an array of objects`);
  return value;
}

function uniqueStrings(value: unknown, owner: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${owner} must be an array`);
  const result = value.map((item, index) => nonEmptyString(item, `${owner}[${index}]`));
  if (new Set(result).size !== result.length)
    throw new Error(`${owner} must contain unique values`);
  return result;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function repoPath(root: string, value: string): string {
  if (value === '' || isAbsolute(value) || value.includes('\0'))
    throw new Error(`unsafe path: ${value}`);
  const absolute = resolve(root, value);
  const rel = relative(root, absolute);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel))
    throw new Error(`path escapes repository: ${value}`);
  return rel.split(sep).join('/');
}

function validatePolicy(value: unknown): Policy {
  if (!isRecord(value)) throw new Error('policy must be an object');
  exactKeys(
    value,
    [
      'schemaVersion',
      'markers',
      'forbiddenPaths',
      'protectedPaths',
      'classifiers',
      'markerConstraints',
      'excludedInventoryPaths',
      'expectedInventoryDigest',
      'expectedCounts',
    ],
    'policy'
  );
  if (value.schemaVersion !== 'gennady.v1-eradication-policy.v1')
    throw new Error(`unsupported policy schema: ${String(value.schemaVersion)}`);

  const markerIds = new Set<string>();
  const markers = objectArray(value.markers, 'markers').map((item, index): Marker => {
    exactKeys(item, ['id', 'literal', 'pattern'], `markers[${index}]`);
    const id = nonEmptyString(item.id, `markers[${index}].id`);
    if (markerIds.has(id)) throw new Error(`duplicate marker id: ${id}`);
    markerIds.add(id);
    const literal =
      item.literal === undefined ? undefined : nonEmptyString(item.literal, `${id}.literal`);
    const pattern =
      item.pattern === undefined ? undefined : nonEmptyString(item.pattern, `${id}.pattern`);
    if ((literal === undefined) === (pattern === undefined))
      throw new Error(`marker ${id} must declare exactly one matcher`);
    if (pattern !== undefined) regexp(pattern, `marker ${id}`);
    return { id, literal, pattern };
  });

  const protectedPathsSeen = new Set<string>();
  const protectedPaths = objectArray(value.protectedPaths, 'protectedPaths').map(
    (item, index): ProtectedPath => {
      exactKeys(item, ['path', 'classification', 'requiredLiteral'], `protectedPaths[${index}]`);
      const path = nonEmptyString(item.path, `protectedPaths[${index}].path`);
      if (protectedPathsSeen.has(path)) throw new Error(`duplicate protected path: ${path}`);
      protectedPathsSeen.add(path);
      return {
        path,
        classification: classification(item.classification, `protectedPaths[${index}]`),
        requiredLiteral: nonEmptyString(
          item.requiredLiteral,
          `protectedPaths[${index}].requiredLiteral`
        ),
      };
    }
  );

  const classifiers = objectArray(value.classifiers, 'classifiers').map(
    (item, index): Classifier => {
      exactKeys(
        item,
        ['path', 'prefix', 'pattern', 'classification', 'reason'],
        `classifiers[${index}]`
      );
      const path =
        item.path === undefined
          ? undefined
          : nonEmptyString(item.path, `classifiers[${index}].path`);
      const prefix =
        item.prefix === undefined
          ? undefined
          : nonEmptyString(item.prefix, `classifiers[${index}].prefix`);
      const pattern =
        item.pattern === undefined
          ? undefined
          : nonEmptyString(item.pattern, `classifiers[${index}].pattern`);
      if ([path, prefix, pattern].filter((entry) => entry !== undefined).length !== 1)
        throw new Error(`classifiers[${index}] must declare exactly one matcher`);
      if (pattern !== undefined) regexp(pattern, `classifiers[${index}]`);
      return {
        path,
        prefix,
        pattern,
        classification: classification(item.classification, `classifiers[${index}]`),
        reason: nonEmptyString(item.reason, `classifiers[${index}].reason`),
      };
    }
  );

  const constraintIds = new Set<string>();
  const markerConstraints = objectArray(value.markerConstraints, 'markerConstraints').map(
    (item, index): MarkerConstraint => {
      exactKeys(
        item,
        ['markerId', 'forbiddenClassifications', 'allowContexts'],
        `markerConstraints[${index}]`
      );
      const markerId = nonEmptyString(item.markerId, `markerConstraints[${index}].markerId`);
      if (!markerIds.has(markerId))
        throw new Error(`marker constraint references unknown marker: ${markerId}`);
      if (constraintIds.has(markerId)) throw new Error(`duplicate marker constraint: ${markerId}`);
      constraintIds.add(markerId);
      if (
        !Array.isArray(item.forbiddenClassifications) ||
        item.forbiddenClassifications.length === 0
      )
        throw new Error(`${markerId}.forbiddenClassifications must be a non-empty array`);
      const forbiddenClassifications = item.forbiddenClassifications.map(
        (entry, classificationIndex) =>
          classification(entry, `${markerId}.forbiddenClassifications[${classificationIndex}]`)
      );
      if (new Set(forbiddenClassifications).size !== forbiddenClassifications.length)
        throw new Error(`${markerId}.forbiddenClassifications must be unique`);
      const allowContexts =
        item.allowContexts === undefined
          ? undefined
          : objectArray(item.allowContexts, `${markerId}.allowContexts`).map(
              (context, contextIndex) => {
                exactKeys(
                  context,
                  ['pathPattern', 'kind'],
                  `${markerId}.allowContexts[${contextIndex}]`
                );
                const pathPattern = nonEmptyString(
                  context.pathPattern,
                  `${markerId}.allowContexts[${contextIndex}].pathPattern`
                );
                regexp(pathPattern, `${markerId}.allowContexts[${contextIndex}]`);
                if (context.kind !== 'source-provenance-comment')
                  throw new Error(`${markerId}.allowContexts[${contextIndex}] has unknown kind`);
                return { pathPattern, kind: 'source-provenance-comment' as const };
              }
            );
      return { markerId, forbiddenClassifications, allowContexts };
    }
  );
  const markerById = new Map(markers.map((marker) => [marker.id, marker]));
  const constraintById = new Map(
    markerConstraints.map((constraint) => [constraint.markerId, constraint])
  );
  for (const [markerId, requiredMatcher] of REQUIRED_ACTIVE_REFERENCE_MARKERS) {
    const marker = markerById.get(markerId);
    if (
      marker === undefined ||
      marker.literal !== requiredMatcher.literal ||
      marker.pattern !== requiredMatcher.pattern
    )
      throw new Error(`${markerId} must retain its fail-closed active-reference matcher`);
    const constraint = constraintById.get(markerId);
    if (
      constraint === undefined ||
      ACTIVE_CLASSIFICATIONS.some(
        (activeClassification) =>
          !constraint.forbiddenClassifications.includes(activeClassification)
      )
    )
      throw new Error(`${markerId} must remain forbidden in every active classification`);
  }

  const expectedInventoryDigest = nonEmptyString(
    value.expectedInventoryDigest,
    'expectedInventoryDigest'
  );
  if (expectedInventoryDigest !== 'PENDING' && !/^[a-f0-9]{64}$/u.test(expectedInventoryDigest))
    throw new Error('expectedInventoryDigest must be PENDING or a lowercase SHA-256');
  if (!isRecord(value.expectedCounts)) throw new Error('expectedCounts must be an object');
  exactKeys(value.expectedCounts, CLASSIFICATIONS, 'expectedCounts');
  const expectedCounts: Partial<Record<Classification, number>> = {};
  for (const [key, count] of Object.entries(value.expectedCounts)) {
    if (!Number.isInteger(count) || (count as number) < 0)
      throw new Error(`expectedCounts.${key} must be a non-negative integer`);
    expectedCounts[classification(key, 'expectedCounts')] = count as number;
  }
  const excludedInventoryPaths = uniqueStrings(
    value.excludedInventoryPaths,
    'excludedInventoryPaths'
  );
  const unsafeExclusion = excludedInventoryPaths.find(
    (path) => !ALLOWED_INVENTORY_EXCLUSIONS.has(path)
  );
  if (unsafeExclusion !== undefined)
    throw new Error(
      `excludedInventoryPaths cannot hide active repository content: ${unsafeExclusion}`
    );
  return {
    schemaVersion: value.schemaVersion,
    markers,
    forbiddenPaths: uniqueStrings(value.forbiddenPaths, 'forbiddenPaths'),
    protectedPaths,
    classifiers,
    markerConstraints,
    excludedInventoryPaths,
    expectedInventoryDigest,
    expectedCounts,
  };
}

function readPolicy(root: string): Policy {
  const policyPath = join(root, 'scripts/v1-eradication.policy.json');
  return validatePolicy(JSON.parse(readFileSync(policyPath, 'utf8')) as unknown);
}

function trackedAndUntrackedFiles(root: string): string[] {
  const output = execFileSync(
    'git',
    ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
  return [
    ...new Set(
      output
        .split('\0')
        .filter(Boolean)
        .map((file) => repoPath(root, file))
    ),
  ].sort(compareText);
}

function matchingMarkers(content: string, markers: readonly Marker[]): string[] {
  return markers
    .filter((marker) => {
      if ((marker.literal === undefined) === (marker.pattern === undefined))
        throw new Error(`marker ${marker.id} must declare exactly one matcher`);
      return marker.literal !== undefined
        ? content.includes(marker.literal)
        : new RegExp(marker.pattern!, 'u').test(content);
    })
    .map((marker) => marker.id)
    .sort(compareText);
}

function literalOccurrences(content: string, literal: string): number[] {
  const result: number[] = [];
  for (
    let offset = content.indexOf(literal);
    offset >= 0;
    offset = content.indexOf(literal, offset + 1)
  )
    result.push(offset);
  return result;
}

function provenanceCommentContains(content: string, offset: number): boolean {
  const open = content.lastIndexOf('<!--', offset);
  const close = content.indexOf('-->', offset);
  if (open < 0 || close < offset) return false;
  return /^<!--\s*source:\s*ai\/directives\/sdd\//u.test(
    content.slice(open, close + 3).trimStart()
  );
}

function activeReferenceAllowed(
  path: string,
  content: string,
  marker: Marker,
  contexts: readonly MarkerContext[]
): boolean {
  if (marker.literal === undefined) return false;
  if (!/^ai\/kit\/(?:axiom|anti-pattern)\//u.test(path)) return false;
  const occurrences = literalOccurrences(content, marker.literal);
  return (
    occurrences.length > 0 &&
    occurrences.every((offset) =>
      contexts.some(
        (context) =>
          new RegExp(context.pathPattern, 'u').test(path) &&
          context.kind === 'source-provenance-comment' &&
          provenanceCommentContains(content, offset)
      )
    )
  );
}

function classifierFor(path: string, classifiers: readonly Classifier[]): Classifier | undefined {
  return classifiers.find((candidate) => {
    const forms = [candidate.path, candidate.prefix, candidate.pattern].filter(
      (value): value is string => value !== undefined
    );
    if (forms.length !== 1) throw new Error('classifier must declare exactly one matcher');
    if (candidate.path !== undefined) return path === candidate.path;
    if (candidate.prefix !== undefined) return path.startsWith(candidate.prefix);
    return new RegExp(candidate.pattern!, 'u').test(path);
  });
}

function counts(entries: readonly Entry[]): Record<Classification, number> {
  const result: Record<Classification, number> = {
    'canonical-v2': 0,
    'required-v1-to-v2-migration-boundary': 0,
    'historical-test-evidence': 0,
    'unrelated-product-version': 0,
  };
  for (const entry of entries) result[entry.classification] += 1;
  return result;
}

function run(root: string): {
  schemaVersion: 'gennady.v1-eradication-report.v1';
  ok: boolean;
  policyDigest: string;
  inventoryDigest: string;
  counts: Record<Classification, number>;
  entries: Entry[];
  findings: Finding[];
} {
  const policy = readPolicy(root);
  const policyProjection = { ...policy, expectedInventoryDigest: '', expectedCounts: {} };
  const policyDigest = sha256(JSON.stringify(policyProjection));
  const files = trackedAndUntrackedFiles(root);
  const fileSet = new Set(files);
  const excluded = new Set(policy.excludedInventoryPaths.map((file) => repoPath(root, file)));
  const protectedByPath = new Map(
    policy.protectedPaths.map((item) => [repoPath(root, item.path), item])
  );
  const findings: Finding[] = [];
  const entries: Entry[] = [];
  const markersById = new Map(policy.markers.map((marker) => [marker.id, marker]));

  for (const raw of policy.forbiddenPaths) {
    const path = repoPath(root, raw.replace(/\/$/, ''));
    const prefix = `${path}/`;
    const residues = files.filter((file) => file === path || file.startsWith(prefix));
    if (residues.length > 0)
      for (const residue of residues)
        findings.push({
          code: 'V1_ERADICATION_FORBIDDEN_RESIDUE',
          path: residue,
          detail: `forbidden V1-only surface declared by ${raw}`,
        });
  }

  for (const [path, protectedPath] of protectedByPath) {
    if (!fileSet.has(path)) {
      findings.push({
        code: 'V1_ERADICATION_PROTECTED_V2_MISSING',
        path,
        detail: `protected ${protectedPath.classification} surface disappeared`,
      });
      continue;
    }
    const absolute = join(root, path);
    const stat = lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      findings.push({
        code: 'V1_ERADICATION_PROTECTED_V2_UNSAFE',
        path,
        detail: 'protected surface must be a regular non-symlink file',
      });
      continue;
    }
    const content = readFileSync(absolute, 'utf8');
    if (!content.includes(protectedPath.requiredLiteral))
      findings.push({
        code: 'V1_ERADICATION_PROTECTED_V2_RECLASSIFIED',
        path,
        detail: `required identity marker missing: ${protectedPath.requiredLiteral}`,
      });
  }

  for (const path of files) {
    if (excluded.has(path)) continue;
    const absolute = join(root, path);
    let stat;
    try {
      stat = lstatSync(absolute);
    } catch {
      continue;
    }
    if (!stat.isFile() || stat.isSymbolicLink()) continue;
    const bytes = readFileSync(absolute);
    if (bytes.includes(0)) continue;
    const content = bytes.toString('utf8');
    const markers = matchingMarkers(content, policy.markers);
    const protectedPath = protectedByPath.get(path);
    if (markers.length === 0 && protectedPath === undefined) continue;
    const classifier = classifierFor(path, policy.classifiers);
    const classification = protectedPath?.classification ?? classifier?.classification;
    if (classification === undefined) {
      findings.push({
        code: 'V1_ERADICATION_UNCLASSIFIED_CANDIDATE',
        path,
        detail: `candidate markers have no causal classification: ${markers.join(', ') || 'protected'}`,
      });
      continue;
    }
    for (const constraint of policy.markerConstraints) {
      if (
        !markers.includes(constraint.markerId) ||
        !constraint.forbiddenClassifications.includes(classification)
      )
        continue;
      const marker = markersById.get(constraint.markerId)!;
      if (
        constraint.allowContexts !== undefined &&
        activeReferenceAllowed(path, content, marker, constraint.allowContexts)
      )
        continue;
      findings.push({
        code: 'V1_ERADICATION_FORBIDDEN_ACTIVE_REFERENCE',
        path,
        detail: `${constraint.markerId} is forbidden in active ${classification} content`,
      });
    }
    entries.push({
      path,
      classification,
      markers,
      reason:
        protectedPath !== undefined
          ? `protected:${protectedPath.requiredLiteral}`
          : classifier!.reason,
      protected: protectedPath !== undefined,
    });
  }

  entries.sort((left, right) => compareText(left.path, right.path));
  findings.sort((left, right) =>
    compareText(`${left.path}:${left.code}`, `${right.path}:${right.code}`)
  );
  const inventoryDigest = sha256(
    `${policy.schemaVersion}\n${policyDigest}\n${entries
      .map(
        (entry) =>
          `${entry.path}\t${entry.classification}\t${entry.markers.join(',')}\t${entry.protected ? 'protected' : 'classified'}\t${entry.reason}`
      )
      .join('\n')}\n`
  );
  const actualCounts = counts(entries);
  if (policy.expectedInventoryDigest !== inventoryDigest)
    findings.push({
      code: 'V1_ERADICATION_INVENTORY_DRIFT',
      path: 'scripts/v1-eradication.policy.json',
      detail: `expected ${policy.expectedInventoryDigest}, observed ${inventoryDigest}`,
    });
  for (const [classification, expected] of Object.entries(policy.expectedCounts) as Array<
    [Classification, number]
  >) {
    if (actualCounts[classification] !== expected)
      findings.push({
        code: 'V1_ERADICATION_INVENTORY_COUNT_DRIFT',
        path: 'scripts/v1-eradication.policy.json',
        detail: `${classification}: expected ${expected}, observed ${actualCounts[classification]}`,
      });
  }
  findings.sort((left, right) =>
    compareText(`${left.path}:${left.code}`, `${right.path}:${right.code}`)
  );
  return {
    schemaVersion: 'gennady.v1-eradication-report.v1',
    ok: findings.length === 0,
    policyDigest,
    inventoryDigest,
    counts: actualCounts,
    entries,
    findings,
  };
}

function args(argv: readonly string[]): { root: string; format: 'text' | 'json' } {
  let root = process.cwd();
  let format: 'text' | 'json' = 'text';
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (token === '--json') format = 'json';
    else if (token === '--root') root = argv[++index] ?? '';
    else throw new Error(`unknown argument: ${token}`);
  }
  if (root === '') throw new Error('--root requires a value');
  return { root: resolve(root), format };
}

try {
  const options = args(process.argv.slice(2));
  const report = run(options.root);
  if (options.format === 'json') process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else {
    process.stdout.write(
      `${report.ok ? 'PASS' : 'FAIL'} v1-eradication ${report.inventoryDigest}\n` +
        `${Object.entries(report.counts)
          .map(([key, value]) => `${key}=${value}`)
          .join(' ')}\n`
    );
    for (const finding of report.findings)
      process.stderr.write(`${finding.code} ${finding.path}: ${finding.detail}\n`);
  }
  process.exitCode = report.ok ? 0 : 1;
} catch (error) {
  process.stderr.write(
    `V1_ERADICATION_POLICY_INVALID: ${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exitCode = 1;
}
