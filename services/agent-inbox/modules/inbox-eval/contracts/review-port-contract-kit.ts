// @file: ReviewPortContractKit — shared adapter conformance suite for all variable ports.
// @consumers: ReviewEvalHarness, review-eval.contract.test.ts (P2)
// @tasks: TSK-183

import type { VcsInboxPort } from '../../inbox-core/vcs-inbox.port.ts';
import type { OpenCodePort } from '../../inbox-opencode/opencode.port.ts';
import type { ReviewRuntimeReceiptStorePort } from '../../inbox-pipeline/ports/review-runtime-receipt-store.port.ts';

/** @purpose One port conformance check result with a name, pass/fail and specific violation messages. */
export type ContractCheckResult = {
  /** @purpose Unique name for this conformance check */
  checkName: string;
  /** @purpose Whether the check passed */
  pass: boolean;
  /** @purpose Specific violations when the check failed — empty when pass is true */
  violations: string[];
};

/** @purpose Full conformance verification report for one port adapter instance. */
export type ContractVerification = {
  /** @purpose Name of the port that was verified */
  portName: string;
  /** @purpose Whether every check for this port passed */
  pass: boolean;
  /** @purpose Individual check results */
  checks: ContractCheckResult[];
};

/**
 * @purpose Shared adapter conformance suite that verifies any adapter implements the port contract.
 * @invariant Kit verifies contract shape, not business logic — it does not test the real GitLab API.
 * @invariant Each verification method is idempotent and stateless across calls.
 */
export interface ReviewPortContractKit {
  /**
   * @purpose Verify that a VCS adapter correctly implements the `VcsInboxPort` contract.
   * @param vcs VCS adapter to verify — may be a mock or a real adapter.
   * @returns Conformance verification with per-check results.
   * @sideEffect May call read-only VCS operations (getMrContext, getDiscussions) when the adapter is real.
   */
  verifyVcsPort(vcs: VcsInboxPort): Promise<ContractVerification>;

  /**
   * @purpose Verify that an OpenCode adapter correctly implements the `OpenCodePort` contract.
   * @param opencode OpenCode adapter to verify.
   * @returns Conformance verification with per-check results.
   */
  verifyOpenCodePort(opencode: OpenCodePort): Promise<ContractVerification>;

  /**
   * @purpose Verify that a receipt store adapter correctly implements the `ReviewRuntimeReceiptStorePort` contract.
   * @param store Receipt store adapter to verify.
   * @returns Conformance verification with per-check results.
   */
  verifyReceiptStorePort(store: ReviewRuntimeReceiptStorePort): Promise<ContractVerification>;
}

/**
 * @purpose Deterministic mock-backed port contract kit — verifies adapter contract shape without network access.
 * @implements {ReviewPortContractKit} in ./review-port-contract-kit.ts
 * @invariant All verification methods are network-free and deterministic.
 * @invariant Checks are fail-closed: unknown or absent operations are flagged as violations.
 */
export class DeterministicPortContractKit implements ReviewPortContractKit {
  /** @see {ReviewPortContractKit#verifyVcsPort} in ./review-port-contract-kit.ts */
  async verifyVcsPort(vcs: VcsInboxPort): Promise<ContractVerification> {
    const checks: ContractCheckResult[] = [];

    // #region START_VERIFY_VCS_PORT_OPERATIONS — invariant: all abstract VcsInboxPort methods must be callable
    checks.push(
      this._checkOperation(
        'getActionable is callable',
        typeof vcs.getActionable === 'function',
        'getActionable must be a function on the adapter'
      )
    );
    checks.push(
      this._checkOperation(
        'getMrContext is callable',
        typeof vcs.getMrContext === 'function',
        'getMrContext must be a function on the adapter'
      )
    );
    checks.push(
      this._checkOperation(
        'getDiscussions is callable',
        typeof vcs.getDiscussions === 'function',
        'getDiscussions must be a function on the adapter'
      )
    );
    checks.push(
      this._checkOperation(
        'getHost is callable',
        typeof vcs.getHost === 'function',
        'getHost must be a function on the adapter'
      )
    );
    checks.push(
      this._checkOperation(
        'getHost returns string',
        typeof vcs.getHost() === 'string',
        'getHost() must return a string (empty string is valid for mock/dev mode)'
      )
    );
    // #endregion END_VERIFY_VCS_PORT_OPERATIONS

    return this._buildVerification('VcsInboxPort', checks);
  }

  /** @see {ReviewPortContractKit#verifyOpenCodePort} in ./review-port-contract-kit.ts */
  async verifyOpenCodePort(opencode: OpenCodePort): Promise<ContractVerification> {
    const checks: ContractCheckResult[] = [];

    // #region START_VERIFY_OPENCODE_PORT_OPERATIONS — invariant: all abstract OpenCodePort methods must be callable
    checks.push(
      this._checkOperation(
        'createSession is callable',
        typeof opencode.createSession === 'function',
        'createSession must be a function on the adapter'
      )
    );
    checks.push(
      this._checkOperation(
        'prompt is callable',
        typeof opencode.prompt === 'function',
        'prompt must be a function on the adapter'
      )
    );
    checks.push(
      this._checkOperation(
        'status is callable',
        typeof opencode.status === 'function',
        'status must be a function on the adapter'
      )
    );
    // #endregion END_VERIFY_OPENCODE_PORT_OPERATIONS

    return this._buildVerification('OpenCodePort', checks);
  }

  /** @see {ReviewPortContractKit#verifyReceiptStorePort} in ./review-port-contract-kit.ts */
  async verifyReceiptStorePort(
    store: ReviewRuntimeReceiptStorePort
  ): Promise<ContractVerification> {
    const checks: ContractCheckResult[] = [];

    // #region START_VERIFY_RECEIPT_STORE_PORT_OPERATIONS — invariant: all port operations must be callable
    checks.push(
      this._checkOperation(
        'appendReceipt is callable',
        typeof store.appendReceipt === 'function',
        'appendReceipt must be a function on the adapter'
      )
    );
    checks.push(
      this._checkOperation(
        'appendConsumption is callable',
        typeof store.appendConsumption === 'function',
        'appendConsumption must be a function on the adapter'
      )
    );
    checks.push(
      this._checkOperation(
        'readReceipts is callable',
        typeof store.readReceipts === 'function',
        'readReceipts must be a function on the adapter'
      )
    );
    checks.push(
      this._checkOperation(
        'readConsumptions is callable',
        typeof store.readConsumptions === 'function',
        'readConsumptions must be a function on the adapter'
      )
    );
    // #endregion END_VERIFY_RECEIPT_STORE_PORT_OPERATIONS

    return this._buildVerification('ReviewRuntimeReceiptStorePort', checks);
  }

  /**
   * @purpose Build one `ContractCheckResult` from a boolean condition and a single violation message.
   * @param checkName Unique check name.
   * @param condition Whether the check passed.
   * @param violationMessage Message to include when `condition` is false.
   * @returns Check result.
   */
  protected _checkOperation(
    checkName: string,
    condition: boolean,
    violationMessage: string
  ): ContractCheckResult {
    return {
      checkName,
      pass: condition,
      violations: condition ? [] : [violationMessage],
    };
  }

  /**
   * @purpose Aggregate per-check results into a full `ContractVerification` for one port.
   * @param portName Port name label.
   * @param checks Individual check results.
   * @returns Full verification with derived aggregate pass status.
   */
  protected _buildVerification(
    portName: string,
    checks: ContractCheckResult[]
  ): ContractVerification {
    const pass = checks.every((c) => c.pass);
    return { portName, pass, checks };
  }
}
