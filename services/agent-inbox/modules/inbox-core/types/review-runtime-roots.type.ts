// @file: Physical namespace roots consumed by the runtime profile port.
// @consumers: RuntimeProfilePort, bootstrap
// @tasks: TSK-172

/** @purpose Disjoint physical roots for production, real test and deterministic mock state. */
export type ReviewRuntimeRoots = {
  /** @purpose Canonical working state root used only by production. */
  production: string;
  /** @purpose Parent root for run-id-scoped real test state. */
  test: string;
  /** @purpose Parent root for run-id-scoped deterministic mock state. */
  mock: string;
};
