// @file: Module-level readers that extract findings, verdict, and proposed actions from accumulated RoleInstance artifacts.
// @consumers: role-instance.ts
// @tasks: N/A

import type { RoleArtifacts } from '../role-node.ts';
import type { InstanceState } from '../errors.ts';
import type { ProposedAction } from '../effect-executor.ts';

/**
 * @purpose Extract findings from any session artifact that has recommendations or findings arrays.
 * @param artifacts Accumulated role artifacts.
 * @returns Array of finding objects.
 */
export function extractFindings(artifacts: RoleArtifacts): Array<{
  severity: string;
  file: string;
  line: number;
  message: string;
}> {
  // UNION across ALL artifacts, not the first match (bug fixed 2026-07-23, D-139): the review
  // fan-out stores each lens under its own artifact key (node_track_review/security_lens/
  // code_review). Returning only the FIRST artifact with a `findings` array let a clean first
  // lens mask an error-severity finding a later lens raised — node_ask's SV-24 gate then saw 0
  // findings and auto-approved an MR with a real blocking issue. Collect from every artifact's
  // `findings`/`recommendations` array and dedupe by identity; over-counting only ever escalates
  // (safe), under-counting silently approved (the defect).
  const out: Array<{ severity: string; file: string; line: number; message: string }> = [];
  const seen = new Set<string>();
  const push = (r: Record<string, unknown>): void => {
    const f = {
      severity: (r.severity as string) ?? 'info',
      file: (r.file as string) ?? '',
      line: (r.line as number) ?? 0,
      message: (r.message as string) ?? '',
    };
    const key = `${f.severity}|${f.file}|${f.line}|${f.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(f);
  };

  for (const artifact of Object.values(artifacts)) {
    const obj = artifact as Record<string, unknown> | undefined;
    if (!obj || typeof obj !== 'object') continue;
    const recs = obj.recommendations as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(recs)) for (const r of recs) push(r);
    const findings = obj.findings as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(findings)) for (const f of findings) push(f);
  }
  return out;
}

/**
 * @purpose Extract verdict from accumulated artifacts.
 * Iterates ALL artifacts (not hardcoded node IDs) — any node that
 * produces a `reviewReport.verdict` or `verdict` field contributes.
 * @param artifacts Accumulated role artifacts.
 * @param state Current instance state (used for the fallback verdict).
 * @returns Verdict string.
 */
export function extractVerdict(artifacts: RoleArtifacts, state: InstanceState): string {
  for (const artifact of Object.values(artifacts)) {
    const obj = artifact as Record<string, unknown> | undefined;
    if (!obj || typeof obj !== 'object') continue;

    // Check for reviewReport (from synthesize-like nodes)
    const report = obj.reviewReport as Record<string, unknown> | undefined;
    if (report && typeof report.verdict === 'string') return report.verdict;

    // Check for direct verdict field
    if (typeof obj.verdict === 'string') return obj.verdict;
  }
  return state === 'done' ? 'completed' : 'pending';
}

/**
 * @purpose Find the `proposedActions` array staged by a session/prep node in accumulated
 *   artifacts — the bridge from staged proposals to `EffectExecutor.execute()` (NFC-SV-07).
 * @param artifacts Accumulated role artifacts.
 * @returns The first `proposedActions` array found, or `[]` when no node staged one.
 */
export function collectProposedActions(artifacts: RoleArtifacts): ProposedAction[] {
  for (const artifact of Object.values(artifacts)) {
    const obj = artifact as Record<string, unknown> | undefined;
    if (!obj || typeof obj !== 'object') continue;

    const proposed = obj.proposedActions as ProposedAction[] | undefined;
    if (Array.isArray(proposed)) return proposed;
  }
  return [];
}
