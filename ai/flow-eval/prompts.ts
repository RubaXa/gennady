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
  brownfield: `Modify EXISTING code in this repository to satisfy the change-request in inputs/change.md. There is NO specification — the behaviour lives only in the code.
First read the existing artifact named by the change-request to understand what it does; then make the smallest delta that adds the requested behaviour or corrects the reported defect, WITHOUT changing any UNRELATED behaviour, output format, or error contract.
Follow the code's own conventions (shebang, strict mode, style). Do not rewrite unrelated parts, do not install packages, do not scaffold specs/tickets, and do not edit the fixture's sample inputs or its golden/ directory. Report the delta you made.`,
};

// The `brownfield` phase covers several distinct decision branches; the mode selects the instruction.
// Delta modes (modify-code-delta/fix-code-delta) use PHASE_PROMPTS.brownfield above; the spec-facing
// modes below recover or evolve a written specification and each isolate their own branch.
const BROWNFIELD_MODE_PROMPTS: Partial<Record<SddEvalMode, string>> = {
  'recover-spec': `Recover a module specification DIRECTLY from the code. Do NOT run discovery, interviews, or amplification, and do NOT read the router/directive chain — this is a code→spec extraction, not greenfield authoring.
Steps: (1) read the tool's source (e.g. bin/report.sh); (2) list its observable behaviours — inputs, each output line, and error/edge handling; (3) look at the existing specs/ tree and place the spec accordingly — if a scope spec already exists, add the MODULE spec UNDER that scope (specs/<scope>/<module>/<module>.spec.md) and never overwrite the scope spec; if a module spec already exists but omits some current behaviour, EXTEND it without deleting what is there; otherwise create specs/<tool>/<tool>.spec.md. (4) the spec has a "## Behaviour" section and a "## Functional Requirements" section with one bullet per behaviour (include the error/edge), written with exactly one Write per spec file. Then stop.
Do not change the code and do not invent behaviour the code does not have. Report the spec file you wrote.`,
  'delta-to-spec': `The code already carries a recent change (inputs/change.md describes what was added) but has NO specification. Write the spec DIRECTLY from the code — do NOT run discovery/interviews and do NOT read the router/directive chain.
Steps: (1) read the tool's source and inputs/change.md; (2) with exactly one Write, create specs/<tool>/<tool>.spec.md with a "## Behaviour" section and a "## Functional Requirements" section (one bullet per behaviour, INCLUDING the change that already landed, plus the error/edge). Then stop.
Do not change the code. Report the spec file you wrote.`,
  'modify-via-spec': `Realise the change-request in inputs/change.md THROUGH the specification, directly — do NOT run discovery/interviews and do NOT read the router/directive chain.
Steps: (1) read the existing specs/<tool>/<tool>.spec.md and the tool's source; (2) update the spec (one Write) to describe the new behaviour as a functional requirement; (3) change the code to match, keeping all unrelated behaviour, output format, and error contracts unchanged. Then stop.
Report both the spec update and the code delta you made.`,
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
  const basePrompt =
    scenario.phase === 'brownfield'
      ? (BROWNFIELD_MODE_PROMPTS[scenario.mode] ?? PHASE_PROMPTS.brownfield)
      : PHASE_PROMPTS[scenario.phase];
  return appendSddSessionBoundary(
    [
      basePrompt,
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
