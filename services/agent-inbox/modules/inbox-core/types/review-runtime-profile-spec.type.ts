// @file: Input shape for composing one immutable review runtime profile.
// @consumers: ReviewRuntimeProfile, bootstrap
// @tasks: TSK-172

/** @purpose State namespaces separated by the runtime safety boundary. */
export type ReviewStateNamespace = 'production' | 'test' | 'mock';

/** @purpose External I/O policies admitted by the review runtime. */
export type ReviewExternalIoPolicy =
  | 'real-work'
  | 'real-readonly'
  | 'real-effects'
  | 'deterministic-mock';

/** @purpose Declarative input validated before any runtime adapter is assembled. */
export type ReviewRuntimeProfileSpec = {
  /** @purpose Namespace owning every local state access for the process. */
  stateNamespace: ReviewStateNamespace;
  /** @purpose External I/O capability available to the process. */
  externalIoPolicy: ReviewExternalIoPolicy;
  /** @purpose Stable diagnostic run identity | @invariant Required outside production and safe as one path segment */
  runId?: string;
  /** @purpose Identity of the explicit test-effect allowlist | @invariant Required only for real-effects */
  effectAllowlistIdentity?: string;
};
