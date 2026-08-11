// @file: Legacy role-facing alias for the canonical runtime-owned outcome classifier.
// @consumers: RoleInstance.step()
// @tasks: TSK-113, TSK-175

import type {
  AgentClassifiedOutcome,
  AgentRemediation,
} from '../inbox-opencode/agent-outcome-classifier.ts';
export { AgentOutcomeClassifier as OutcomeClassifier } from '../inbox-opencode/agent-outcome-classifier.ts';

/**
 * @purpose Outcome class — one of 7 possible classifications of AI-node output.
 * @consumer RoleInstance, RecoveryLadder
 */
export type ClassifiedOutcome = AgentClassifiedOutcome;

/**
 * @purpose Remediation action derived from the outcome class.
 * @consumer RoleInstance.recover()
 */
export type RemediationAction = AgentRemediation;
