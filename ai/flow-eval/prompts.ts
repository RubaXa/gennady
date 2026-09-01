// @file: Canonical SDD phase prompts for intellectual evaluation runs.
// @consumers: runner; prompts intentionally stop at the requested approval boundary.

import type { SddEvalMode, SddEvalPhase, SddEvalScenario } from './types.ts';

const PHASE_PROMPTS: Record<SddEvalPhase, string> = {
  'spec-authoring': `Run the installed SDD flow for full specification authoring.
Read and follow the installed SDD skill and router/directive chain (starting at ai/skills/sdd/SKILL.md and ai/directives/sdd-v2/router.directive.xml).
Perform discovery, interview/amplification, and write the complete canonical spec artifacts.
Do not implement product code and do not invent a shortcut workflow. Stop at Approval #1 and clearly report the approval boundary.`,
  scaffold: `Run the installed SDD scaffold flow for actual ticket authoring.
Read and follow the installed SDD skill and router/directive chain (starting at ai/skills/sdd/SKILL.md and ai/directives/sdd-v2/router.directive.xml).
Use the approved canonical specification in the workspace, derive real implementation tickets with dependencies and acceptance criteria, and write the canonical task artifacts.
Do not merely describe tickets and do not implement product code. Stop at Approval #2 and clearly report the approval boundary.`,
  execute: `Run the installed SDD execute flow against the prepared canonical specification and tickets.
Read and follow the installed SDD skill and router/directive chain (starting at ai/skills/sdd/SKILL.md and ai/directives/sdd-v2/router.directive.xml).
Execute the canonical tickets in dependency order, preserve the SDD evidence/artifact contracts, and verify the resulting implementation with tests.
Do not replace the canonical inputs with an ad-hoc coding plan.`,
};

/** @purpose Compose the exact worker instruction for a phase/mode scenario. */
export function composeSddPhasePrompt(
  scenario: Pick<SddEvalScenario, 'phase' | 'mode' | 'intent' | 'acceptance'>
): string {
  const modeLine = `Selected phase: ${scenario.phase}; selected mode: ${scenario.mode}.`;
  const acceptance = scenario.acceptance ? `Acceptance criteria:\n${scenario.acceptance}` : '';
  return [
    PHASE_PROMPTS[scenario.phase],
    modeLine,
    `Scenario intent:\n${scenario.intent}`,
    acceptance,
  ]
    .filter(Boolean)
    .join('\n\n');
}
