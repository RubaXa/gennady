// @file: VCS runtime profile selection — bind read and effect ports independently.
// @consumers: agent-inbox serve composition root
// @tasks: TSK-174

import type { VcsEffectPort, VcsReadPort } from './vcs-port.ts';
import { ReadonlyEffectGuard } from './readonly-effect.guard.ts';

/** @purpose External-I/O policies understood by the VCS composition boundary. */
export type VcsRuntimePolicy =
  | 'deterministic-mock'
  | 'real-readonly'
  | 'real-work'
  | 'real-effects';

/** @purpose Independently selected read and effect adapters for one runtime profile. */
export type VcsRuntime = {
  /** @purpose Provider truth reader; readonly profiles retain real reads. */
  read: VcsReadPort;
  /** @purpose Provider effect adapter or a local readonly guard. */
  effects: VcsEffectPort;
};

/**
 * @purpose Select independent read/effect surfaces without constructing another provider hierarchy.
 * @param policy Validated runtime external-I/O policy.
 * @param adapter Existing memory or GitLab adapter implementing both port surfaces.
 * @returns Profile-bound VCS runtime.
 */
export function selectVcsRuntime(
  policy: VcsRuntimePolicy,
  adapter: VcsReadPort & VcsEffectPort
): VcsRuntime {
  return {
    read: adapter,
    effects: policy === 'real-readonly' ? new ReadonlyEffectGuard() : adapter,
  };
}
