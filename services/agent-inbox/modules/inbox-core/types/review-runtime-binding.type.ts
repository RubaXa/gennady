// @file: Validated physical binding returned by the runtime profile port.
// @consumers: StateStore, bootstrap
// @tasks: TSK-172

import type { ReviewRuntimeProfile } from '../runtime-profile.ts';

/** @purpose Process-scoped binding between a validated profile and its canonical state root. */
export type ReviewRuntimeBinding = {
  /** @purpose Immutable runtime capabilities validated before adapter composition. */
  profile: ReviewRuntimeProfile;
  /** @purpose Canonical physical root assigned exclusively to this profile/run. */
  stateRoot: string;
  /** @purpose Whether an existing diagnostic run was reopened without effect capability. */
  reopenedReadOnly: boolean;
};
