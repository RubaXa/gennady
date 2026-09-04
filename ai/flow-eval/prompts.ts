// @file: Canonical SDD phase prompts for intellectual evaluation runs.
// @consumers: runner; prompts intentionally stop at the requested approval boundary.

import type { SddEvalMode, SddEvalPhase, SddEvalScenario } from './types.ts';
import { appendSddSessionBoundary } from '../../shared/sdd/session-boundary.ts';

const PHASE_PROMPTS: Record<SddEvalPhase, string> = {
  'spec-authoring': `Run the installed SDD flow for full specification authoring.
Read and follow the installed SDD skill and router/directive chain (starting at ai/skills/sdd/SKILL.md and ai/directives/sdd-v2/router.directive.xml).
Perform discovery, interview/amplification, and write the complete canonical spec artifacts.
For each authored spec, read its on-disk skeleton, compose the entire document, and overwrite it with exactly one Write. Edit/Patch and sectional writes are forbidden; no skeleton guidance comment may remain.
Do not implement product code and do not invent a shortcut workflow. Stop at Approval #1 and clearly report the approval boundary.`,
  scaffold: `Run the installed SDD scaffold flow for actual ticket authoring.
Read and follow the installed SDD skill and router/directive chain (starting at ai/skills/sdd/SKILL.md and ai/directives/sdd-v2/router.directive.xml).
Use the approved canonical specification in the workspace, derive real implementation tickets with dependencies and acceptance criteria, and write the canonical task artifacts.
Do not merely describe tickets and do not implement product code. Stop at Approval #2 and clearly report the approval boundary.`,
  execute: `Run the installed SDD execute flow against the prepared canonical specification and tickets.
Read and follow the installed SDD skill and router/directive chain (starting at ai/skills/sdd/SKILL.md and ai/directives/sdd-v2/router.directive.xml).
Execute the canonical tickets in dependency order, preserve the SDD evidence/artifact contracts, and verify the resulting implementation with tests.
Do not replace the canonical inputs with an ad-hoc coding plan.`,
  repair: `Run the installed SDD repair flow on a workspace whose specifications are structurally complete but fail the mechanical checker.
Read and follow the installed SDD skill and router/directive chain (starting at ai/skills/sdd/SKILL.md and ai/directives/sdd-v2/router.directive.xml).
Run \`npx --no-install gennady sdd-check --all .\`, then fix every reported error in its owning artifact using exactly one Write per file, guided by each finding's own message. Re-run the check and repeat until it is clean.
Do not disable, weaken, or work around any check; do not author new scopes/modules or implement product code. Report the final clean check.`,
  task: `Complete the single infrastructure task described in inputs/brief.md — an ordinary bash/Makefile job, no SDD ceremony and no heavy dependency installation.
Produce exactly the artifact(s) the brief names (e.g. a script under bin/ or a Makefile), make scripts executable, and follow shell best practice: a shebang and strict mode (set -euo pipefail), clear errors on bad input, and idempotent, path-safe behaviour.
Do not install packages, do not scaffold specs/tickets, and do not edit the fixture's sample inputs or its golden/ directory. Report what you produced.`,
};

/** @purpose Compose the exact worker instruction for a phase/mode scenario. */
export function composeSddPhasePrompt(
  scenario: Pick<
    SddEvalScenario,
    'phase' | 'mode' | 'intent' | 'acceptance' | 'scale' | 'directory'
  >
): string {
  if (!scenario.directory) throw new Error('SDD eval worker prompt requires an isolated directory');
  const modeLine = `Selected phase: ${scenario.phase}; selected mode: ${scenario.mode}.`;
  const scaleLine = scenario.scale
    ? `Synthetic operator-confirmed SCALE: ${scenario.scale}. Do not reassess or debate SCALE.`
    : '';
  const acceptance = scenario.acceptance ? `Acceptance criteria:\n${scenario.acceptance}` : '';
  const headlessOperator = `Headless evaluation contract:
- Do not call an interactive question/approval tool; no human UI is attached to this session.
- The selected phase and mode are authoritative test inputs. Classify the repository once, resolve the required owner chain, and act; do not repeatedly debate or reclassify the route.
- Read an unchanged directive or artifact once and reuse that evidence. Do not narrate internal plans or repeat already established state between tool calls.
- The fixture already provides the installed Gennady CLI. Invoke only exact calls named by the selected directive: never probe --help/--version, redirect CLI stdout/stderr, or inspect node_modules/gennady or dist.
- Treat the scenario intent and acceptance criteria as the synthetic operator's answers and approval of intermediate interview checkpoints. When a minor answer is absent, choose the simplest conservative default. Do not narrate or pause at intermediate checkpoints; collect assumptions and state them once in the final approval-boundary summary, never as invented durable rationale.
- Never waive a failed gate, accept a risk, or write an operator decision/Decision Log entry on the synthetic operator's behalf. A red required gate is a blocker and must remain visible.
- Do not approve the target boundary on the operator's behalf. For spec-authoring leave Approval #1 pending; for scaffold leave Approval #2 pending. Present the actual artifacts and return normally at that boundary.`;
  return appendSddSessionBoundary(
    [
      PHASE_PROMPTS[scenario.phase],
      headlessOperator,
      modeLine,
      scaleLine,
      `Scenario intent:\n${scenario.intent}`,
      acceptance,
    ]
      .filter(Boolean)
      .join('\n\n'),
    scenario.directory
  );
}
