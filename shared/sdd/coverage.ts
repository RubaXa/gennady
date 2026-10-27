// @file: Pure declaration-driven SDD coverage projection with stage-aware ownership obligations.
// @spec: SHARED
// @consumers: future orient/check/phase adapters, coverage controls

import { isCanonicalSpecId } from './spec-id.ts';
import type {
  CoverageFinding,
  CoverageInput,
  CoverageObservation,
  CoverageResult,
  CoverageRow,
  CoverageSpec,
  CoverageTarget,
} from './coverage.types.ts';

type Claim = { owners: Set<string>; sources: Set<string>; mapped: boolean };
const ordered = (values: Iterable<string>): string[] => [...new Set(values)].sort();

function exactPath(path: string): boolean {
  return (
    path.length > 0 &&
    path !== 'none' &&
    path === path.trim() &&
    !/^(?:\/|[A-Za-z]:)/.test(path) &&
    !/[\\\0\r\n*?{}]/.test(path) &&
    path.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
  );
}

function diagnoseRow(
  input: CoverageInput,
  path: string,
  claim: Claim,
  targets: readonly CoverageTarget[],
  observed: CoverageObservation | undefined,
  specs: ReadonlyMap<string, CoverageSpec>
): { row: CoverageRow; findings: CoverageFinding[] } {
  const findings: CoverageFinding[] = [];
  const add = (code: string, detail: string, severity: 'error' | 'pending' = 'error') =>
    findings.push({ code, path, detail, severity });
  const strict = input.stage === 'phase-exit' || input.stage === 'audit';
  const deletion = targets.some((target) => target.operation === 'delete');
  const write = targets.some((target) => target.operation === 'write');
  const owners = ordered(claim.owners);
  if (owners.length !== 1)
    add('OWNER_CONFLICT', `Expected one owner; observed ${owners.join(', ')}`);
  if (targets.some((target) => !owners.includes(target.specId)))
    add('TARGET_OWNER_CONFLICT', 'A phase claim disagrees with the declared file owner');
  if (deletion && write)
    add('WRITE_DELETE_CONFLICT', 'Selected claims both write and delete this path');
  if (observed === undefined)
    add('OBSERVATION_MISSING', 'Adapter supplied no observation for declared path');
  else if (observed.state === 'unsafe')
    add('UNSAFE_PATH', 'Adapter could not prove a safe regular-file path');
  else if (deletion && observed.state === 'missing') {
    // An explicit tombstone explains absence; a missing file alone does not.
  } else if (observed.state === 'missing') {
    if ((observed.previousSpecIds?.length ?? 0) > 0)
      add(
        'UNEXPECTED_MISSING',
        'Previously owned implementation disappeared without a deletion claim'
      );
    else if (write && strict) add('MISSING_TARGET', 'A required phase output does not exist');
    else
      add(
        'PLANNED_FILE',
        'Declared file is not materialized; no implementation coverage is proven',
        'pending'
      );
  } else {
    if (deletion)
      add('DELETE_TARGET_EXISTS', 'Declared deletion is not applied', strict ? 'error' : 'pending');
    if (observed.specIds.length === 0) {
      const removed = (observed.previousSpecIds?.length ?? 0) > 0;
      add(
        removed ? 'REMOVED_OWNERSHIP' : 'MISSING_HEADER',
        'Existing declared file needs its canonical @spec',
        strict || removed ? 'error' : 'pending'
      );
    } else if (observed.specIds.length !== 1)
      add('AMBIGUOUS_HEADER', 'Expected exactly one @spec declaration');
    else {
      const actual = observed.specIds[0] as string;
      if (!specs.has(actual)) add('UNRESOLVED_HEADER', `Unknown @spec ${actual}`);
      else if (!owners.includes(actual))
        add('HEADER_OWNER_CONFLICT', `Header ${actual} disagrees with declared owner`);
      if (!claim.mapped && input.stage === 'audit')
        add('MAPPING_REQUIRED', 'Header/phase claim is not present in the owning File Mapping');
    }
  }
  return {
    row: {
      path,
      owners,
      sources: ordered(claim.sources),
      state: findings.some((finding) => finding.severity === 'error')
        ? 'invalid'
        : findings.length > 0
          ? 'pending'
          : deletion && observed?.state === 'missing'
            ? 'deleted'
            : 'consistent',
    },
    findings,
  };
}

/**
 * @purpose Project declarations and observations into one explainable, stage-aware coverage map.
 * @invariant No I/O or mutation, no inferred owner from directory names, no Verify PASS fabrication.
 * @param input Canonical declarations, exact selection and fresh caller-owned file observations.
 * @returns Deterministically sorted rows and findings; pending is never complete coverage.
 */
export function resolveSddCoverage(input: CoverageInput): CoverageResult {
  const selection = input.selection;
  const inPhase = (target: CoverageTarget) =>
    selection.kind === 'phase' &&
    target.task === selection.task &&
    target.phase === selection.phase;
  const findings: CoverageFinding[] = [];
  const add = (code: string, path: string, detail: string) =>
    findings.push({ code, path, detail, severity: 'error' });
  const specs = new Map<string, CoverageSpec>();
  const claims = new Map<string, Claim>();
  const claimFor = (path: string): Claim => {
    let claim = claims.get(path);
    if (!claim) {
      claim = { owners: new Set(), sources: new Set(), mapped: false };
      claims.set(path, claim);
    }
    return claim;
  };
  for (const spec of input.specs) {
    if (!isCanonicalSpecId(spec.id) || !exactPath(spec.path))
      add('INVALID_SPEC', spec.path, 'Invalid canonical spec identity/path');
    if (specs.has(spec.id)) add('DUPLICATE_SPEC_ID', spec.path, `Duplicate identity ${spec.id}`);
    specs.set(spec.id, spec);
    for (const path of spec.files) {
      if (!exactPath(path)) {
        add('INVALID_PATH', path, 'File Mapping needs an exact repo-relative path');
        continue;
      }
      const claim = claimFor(path);
      claim.owners.add(spec.id);
      claim.sources.add(`mapping:${spec.path}`);
      claim.mapped = true;
    }
  }
  const targetMap = new Map<string, CoverageTarget[]>();
  for (const target of input.targets) {
    if (target.operation === 'read') continue;
    if (selection.kind === 'phase' && !inPhase(target)) continue;
    if (!exactPath(target.path)) {
      add('INVALID_PATH', target.path, 'Target needs an exact repo-relative path');
      continue;
    }
    if (!specs.has(target.specId))
      add('UNRESOLVED_SPEC', target.path, `Unknown target owner ${target.specId}`);
    const list = targetMap.get(target.path) ?? [];
    list.push(target);
    targetMap.set(target.path, list);
  }
  const observations = new Map<string, CoverageObservation>();
  for (const observed of input.observations) {
    if (!exactPath(observed.path)) {
      add('INVALID_PATH', observed.path, 'Observation path is not canonical');
      continue;
    }
    if (observations.has(observed.path))
      add('DUPLICATE_OBSERVATION', observed.path, 'Observation is not unique');
    observations.set(observed.path, observed);
  }
  const selectedSpecs = new Set<string>();
  const visiting = new Set<string>();
  const visit = (root: string): void => {
    const stack = [{ id: root, exit: false }];
    while (stack.length > 0) {
      const { id, exit } = stack.pop() as { id: string; exit: boolean };
      if (exit) {
        visiting.delete(id);
        continue;
      }
      if (visiting.has(id)) {
        add('SPEC_CYCLE', id, 'Structural child cycle');
        continue;
      }
      if (selectedSpecs.has(id)) continue;
      const spec = specs.get(id);
      if (!spec) {
        add('UNRESOLVED_SPEC', id, 'Structural spec is absent');
        continue;
      }
      selectedSpecs.add(id);
      visiting.add(id);
      stack.push({ id, exit: true });
      for (const child of [...spec.children].reverse()) stack.push({ id: child, exit: false });
    }
  };
  if (input.stage === 'phase-exit' && selection.kind !== 'phase')
    add('PHASE_CONTEXT_REQUIRED', '', 'Phase exit requires an exact task and phase');
  if (selection.kind === 'project') for (const id of specs.keys()) visit(id);
  else if (selection.kind === 'spec') visit(selection.id);
  else {
    const selected = input.targets.filter(inPhase);
    if (selected.length === 0)
      add('PHASE_CONTEXT_MISSING', '', 'No declared target context for the selected task/phase');
    for (const target of selected) if (target.operation !== 'read') visit(target.specId);
  }
  const paths = new Set<string>();
  if (selection.kind !== 'phase') {
    for (const [path, claim] of claims)
      if ([...claim.owners].some((id) => selectedSpecs.has(id))) paths.add(path);
  }
  for (const [path, targets] of targetMap) {
    for (const target of targets) {
      if (selection.kind === 'phase' ? !inPhase(target) : !selectedSpecs.has(target.specId))
        continue;
      paths.add(path);
      const claim = claimFor(path);
      if (!claim.mapped) claim.owners.add(target.specId);
      claim.sources.add(`target:${target.task}#${target.phase}:${target.operation}`);
    }
  }
  if (selection.kind !== 'phase')
    for (const observed of observations.values()) {
      for (const id of ordered([...observed.specIds, ...(observed.previousSpecIds ?? [])])) {
        if (selection.kind !== 'project' && !selectedSpecs.has(id)) continue;
        paths.add(observed.path);
        const claim = claimFor(observed.path);
        if (!claim.mapped && !targetMap.has(observed.path)) claim.owners.add(id);
        claim.sources.add(`header:${id}`);
      }
    }
  const rows: CoverageRow[] = [];
  for (const path of ordered(paths)) {
    const targets = (targetMap.get(path) ?? []).filter(
      (target) => selection.kind !== 'phase' || inPhase(target)
    );
    const diagnosis = diagnoseRow(
      input,
      path,
      claimFor(path),
      targets,
      observations.get(path),
      specs
    );
    rows.push(diagnosis.row);
    findings.push(...diagnosis.findings);
  }
  findings.sort(
    (a, b) =>
      a.path.localeCompare(b.path) ||
      a.code.localeCompare(b.code) ||
      a.detail.localeCompare(b.detail)
  );
  const complete = findings.length === 0;
  return {
    stage: input.stage,
    complete,
    canProceed:
      !findings.some((finding) => finding.severity === 'error') &&
      (input.stage === 'authoring' || input.stage === 'preflight' || complete),
    rows,
    findings,
  };
}
