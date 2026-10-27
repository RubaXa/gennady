// @file: Shared strict read-only CLI coverage query for orient and sdd-check.
// @spec: CLI
// @consumers: orient, sdd-check

import { readSddCoverage } from '../../../shared/sdd/coverage-repository.ts';
import type { CoverageSelection, CoverageStage } from '../../../shared/sdd/coverage.types.ts';

/**
 * @purpose Parse one bounded coverage query before any filesystem observation and render the shared map.
 * @invariant Coverage mode never dispatches Verify, mutates tickets, or scans unclaimed source files.
 * @param rawArgs Process argv, including the orient or sdd-check command token.
 * @param root Checkout root used by the calling CLI.
 * @returns Text/JSON and exit 0 for preparation without errors, 1 for inconsistency, 2 for bad invocation.
 */
export function runSddCoverageQuery(
  rawArgs: string[],
  root: string
): { text: string; exitCode: number } {
  let spec = '';
  let task = '';
  let phase = '';
  let stage: CoverageStage = 'audit';
  let json = false;
  const seen = new Set<string>();
  const invalid = (reason: string) => ({
    text: `SDD_COVERAGE_BAD_INVOCATION: ${reason}`,
    exitCode: 2,
  });
  const tokens = rawArgs.slice(2);
  if (tokens[0] === 'orient' || tokens[0] === 'sdd-check') tokens.shift();
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!;
    const equals = token.indexOf('=');
    const key = equals < 0 ? token : token.slice(0, equals);
    if (seen.has(key)) return invalid(`Duplicate ${key}`);
    seen.add(key);
    if (key === '--coverage' || key === '--json') {
      if (equals >= 0) return invalid(`${key} takes no value`);
      if (key === '--json') json = true;
      continue;
    }
    if (!['--spec', '--task', '--phase', '--stage', '--format'].includes(key))
      return invalid(`Unsupported coverage option ${key}`);
    const value = equals < 0 ? tokens[++index] : token.slice(equals + 1);
    if (!value || value.startsWith('--')) return invalid(`${key} requires a value`);
    if (key === '--spec') spec = value;
    if (key === '--task') task = value;
    if (key === '--phase') phase = value;
    if (key === '--stage') {
      if (!['authoring', 'preflight', 'phase-exit', 'audit'].includes(value))
        return invalid('Unknown ownership stage');
      stage = value as CoverageStage;
    }
    if (key === '--format') {
      if (value !== 'json' && value !== 'text') return invalid('Expected --format json|text');
      json = value === 'json';
    }
  }
  if ((task && !phase) || (phase && !task) || (spec && task))
    return invalid('Choose project, --spec ID/path, or both --task ID/path --phase ID');
  if (stage === 'phase-exit' && !task) return invalid('phase-exit requires exact task and phase');
  if (seen.has('--json') && seen.has('--format')) return invalid('Use either --json or --format');
  const selection: CoverageSelection = task
    ? { kind: 'phase', task, phase }
    : spec
      ? { kind: 'spec', id: spec }
      : { kind: 'project' };
  const document = readSddCoverage(root, selection, stage);
  const coverage = document.coverage;
  const text = json
    ? JSON.stringify(document, null, 2)
    : [
        `SDD declared coverage — ${coverage.rows.length} path(s); ${coverage.complete ? 'consistent' : 'incomplete'}; ${coverage.canProceed ? 'can proceed at this ownership boundary' : 'blocked'}`,
        'Not a repository coverage census or Verify PASS; no gates were executed.',
        ...coverage.rows.map(
          (row) => `${row.state}\t${row.path}\t${row.owners.join(', ')}\t${row.sources.join('; ')}`
        ),
        ...coverage.findings.map(
          (finding) => `${finding.severity} ${finding.code} ${finding.path}: ${finding.detail}`
        ),
        `Explicit reads: metadata=${document.reads.metadataReads}, source=${document.reads.sourceReads}`,
      ].join('\n');
  return { text, exitCode: coverage.canProceed ? 0 : 1 };
}
