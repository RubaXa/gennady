// @file: RightsEscalator — monitors operator inactivity (24h) and triggers notifications.
// @consumers: RoleScheduler
// @tasks: TSK-113

import { logger } from '#logger';
import type { StateStore } from '../inbox-core/state-store.ts';
import type { AuditEntry } from '../inbox-core/audit-log.ts';
import type { RoleInstance } from './role-instance.ts';

/**
 * @purpose Escalation inactivity threshold — 24 hours in milliseconds.
 */
const ESCALATION_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * @purpose Escalation notification cooldown — don't send more than once per 24h.
 */
const NOTIFICATION_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * @purpose Configuration for the RightsEscalator.
 */
export type RightsEscalatorConfig = {
  /** @purpose State store for querying audit entries */
  store: StateStore;
  /** @purpose Escalation threshold in ms | @default 24h */
  threshold?: number;
  /** @purpose Notification cooldown in ms | @default 24h */
  cooldown?: number;
};

/**
 * @purpose Result of an escalation evaluation.
 */
export type EscalationResult = {
  /** @purpose Whether escalation is needed */
  shouldEscalate: boolean;
  /** @purpose If shouldEscalate is false, the reason why */
  reason?: string;
  /** @purpose Human-readable escalation message */
  message?: string;
};

/**
 * @purpose Monitors operator inactivity on ask nodes and triggers VK Teams notifications.
 * @invariant Precondition: instance.currentNode.kind === 'ask'.
 * @invariant Postcondition: 24h without operator_action → notification. Notification cooldown 24h.
 * @invariant Operator action (operator_action audit entry) resets the timer.
 * @consumer RoleScheduler.tick()
 */
export class RightsEscalator {
  /** @purpose State store for querying audit entries */
  protected _store: StateStore;
  /** @purpose Escalation threshold in ms */
  protected _threshold: number;
  /** @purpose Notification cooldown in ms */
  protected _cooldown: number;

  /**
   * @purpose Create an escalator bound to a state store.
   * @param config Escalator configuration.
   */
  constructor(config: RightsEscalatorConfig) {
    this._store = config.store;
    this._threshold = config.threshold ?? ESCALATION_THRESHOLD_MS;
    this._cooldown = config.cooldown ?? NOTIFICATION_COOLDOWN_MS;
  }

  /**
   * @purpose Evaluate whether escalation is needed for a given instance.
   * Reads the audit log for the MR and checks the time since the last operator_action.
   * @param instance The role instance to evaluate — must be at an ask node.
   * @returns Escalation result with whether to escalate and a message.
   */
  async evaluate(instance: RoleInstance): Promise<EscalationResult> {
    logger.debug('[RightsEscalator#evaluate] [idle → evaluating]', {
      instance: instance.id,
      mr: instance.mr,
      state: instance.state,
    });

    // #region START_PRECONDITION_CHECK
    // Precondition: instance must be awaiting operator (at ask node)
    if (instance.state !== 'awaiting_operator') {
      logger.debug(
        '[RightsEscalator#evaluate] [evaluating → skipped] Instance not awaiting operator'
      );
      return {
        shouldEscalate: false,
        reason: 'Instance is not in awaiting_operator state',
      };
    }
    // #endregion END_PRECONDITION_CHECK

    // #region START_QUERY_OPERATOR_ACTIONS
    const auditEntries = await this._store.queryAudit(instance.mr);

    // Find relevant events: operator_action (resets timer) and escalated (cooldown check).
    // effect_applied is intentionally excluded — it's a system event, not an operator action.
    const operatorActions = auditEntries.filter(
      (e: AuditEntry) => e.event === 'operator_action' || e.event === 'escalated'
    );

    // Sort by timestamp descending to find the most recent
    operatorActions.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
    // #endregion END_QUERY_OPERATOR_ACTIONS

    const now = Date.now();
    const lastEscalation = operatorActions.find((e) => e.event === 'escalated');
    const lastOperatorAction = operatorActions.find((e) => e.event === 'operator_action');

    // #region START_CHECK_OPERATOR_ACTION_TIMER
    if (lastOperatorAction) {
      const lastActionTime = new Date(lastOperatorAction.ts).getTime();
      const elapsed = now - lastActionTime;

      if (elapsed < this._threshold) {
        logger.debug('[RightsEscalator#evaluate] [evaluating → timer_reset]', {
          instance: instance.id,
          elapsedMs: elapsed,
          thresholdMs: this._threshold,
        });
        return {
          shouldEscalate: false,
          reason: `Operator acted ${Math.round(elapsed / 3600000)}h ago — within threshold`,
        };
      }
    }
    // #endregion END_CHECK_OPERATOR_ACTION_TIMER

    // #region START_CHECK_INACTIVITY
    // No operator action within threshold → check if it's time to escalate
    const inactivitySource =
      lastOperatorAction ?? auditEntries.find((e) => e.event === 'classified');
    const inactiveSince = inactivitySource
      ? new Date(inactivitySource.ts).getTime()
      : new Date(instance.createdAt).getTime();
    const inactiveDuration = now - inactiveSince;

    if (inactiveDuration < this._threshold) {
      logger.debug('[RightsEscalator#evaluate] [evaluating → not_yet]', {
        instance: instance.id,
        inactiveMs: inactiveDuration,
        thresholdMs: this._threshold,
      });
      return {
        shouldEscalate: false,
        reason: `Inactive for ${Math.round(inactiveDuration / 3600000)}h — below threshold`,
      };
    }
    // #endregion END_CHECK_INACTIVITY

    // #region START_CHECK_COOLDOWN
    // Check notification cooldown — don't spam
    if (lastEscalation) {
      const lastEscalationTime = new Date(lastEscalation.ts).getTime();
      const cooldownElapsed = now - lastEscalationTime;

      if (cooldownElapsed < this._cooldown) {
        logger.debug('[RightsEscalator#evaluate] [evaluating → cooldown]', {
          instance: instance.id,
          cooldownElapsedMs: cooldownElapsed,
          cooldownMs: this._cooldown,
        });
        return {
          shouldEscalate: false,
          reason: `Last escalation was ${Math.round(cooldownElapsed / 3600000)}h ago — cooldown active`,
        };
      }
    }
    // #endregion END_CHECK_COOLDOWN

    // #region START_TRIGGER_ESCALATION
    const hoursInactive = Math.round(inactiveDuration / 3600000);
    logger.info('[RightsEscalator#evaluate] [evaluating → escalate]', {
      instance: instance.id,
      mr: instance.mr,
      hoursInactive,
    });

    return {
      shouldEscalate: true,
      message: `MR ${instance.mr} has been awaiting operator response for ${hoursInactive}h. Please review.`,
    };
    // #endregion END_TRIGGER_ESCALATION
  }

  /**
   * @purpose Record an escalation event in the audit log and trigger notification.
   * @param instance The role instance to escalate.
   * @returns Promise that resolves when escalation is recorded.
   * @sideEffect Appends 'escalated' audit entry. In production, sends VK Teams ping.
   */
  async schedule(instance: RoleInstance): Promise<void> {
    logger.info('[RightsEscalator#schedule] [idle → scheduling]', {
      instance: instance.id,
      mr: instance.mr,
    });

    // Record escalation in audit
    await this._store.appendAudit({
      ts: new Date().toISOString(),
      mr: instance.mr,
      role: instance.role,
      event: 'escalated',
      detail: `Inactivity threshold (${this._threshold}ms) exceeded for ask node`,
    });
  }
}
