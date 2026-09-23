// @file: Types for the V1 consumer migration-runtime bootstrap transaction.
// @spec: CLI-SDD-MIGRATE
// @consumers: migration-bootstrap.ts, sdd-migrate.cmd.ts

/** One observable filesystem action planned by the migration bootstrap. */
export type MigrationBootstrapAction = {
  /** @purpose Operation applied to the consumer tree. */
  kind: 'delete' | 'delete-dir' | 'write';
  /** @purpose Repository-relative target path. */
  path: string;
};

/** Result of a dry-run or write-mode migration bootstrap. */
export type MigrationBootstrapResult =
  | {
      /** @purpose Successful preflight and, in write mode, successful transaction. */
      ok: true;
      /** @purpose Deterministically ordered operations. */
      actions: MigrationBootstrapAction[];
    }
  | {
      /** @purpose Fail-closed preflight or rolled-back write failure. */
      ok: false;
      /** @purpose Operator-actionable reasons; no consumer mutation survives this result. */
      errors: string[];
    };
