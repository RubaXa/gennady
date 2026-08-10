// @file: Addressed durable evidence and review artifact storage boundary.
// @consumers: inbox-pipeline, inbox-chat, inbox-api
// @tasks: TSK-173

/**
 * @purpose Persist and retrieve review artifacts by stable MR-scoped address.
 * @invariant A successful put is durable according to the adapter recovery guarantee.
 */
export interface ArtifactStorePort {
  /** @purpose Stable adapter identity exposed to runtime diagnostics. */
  readonly identity: string;

  /**
   * @purpose Report the latest observable adapter health.
   * @returns Current adapter health and optional failure detail.
   */
  health(): { status: 'healthy' | 'failed'; detail?: string };

  /**
   * @purpose Durably store artifact bytes at one stable MR-scoped address.
   * @param address Canonical MR and artifact identity.
   * @param content Immutable artifact bytes.
   * @throws {Error} When durable storage does not acknowledge the write.
   * @returns Completion only after adapter durability guarantees hold.
   * @sideEffect Writes artifact storage.
   */
  put(address: { mr: string; id: string }, content: Uint8Array): Promise<void>;

  /**
   * @purpose Read artifact bytes without inventing absent evidence.
   * @param address Canonical MR and artifact identity.
   * @throws {Error} When the artifact is absent or unreadable.
   * @returns Exact stored bytes.
   */
  read(address: { mr: string; id: string }): Promise<Uint8Array>;

  /**
   * @purpose List stable artifact identities retained for one MR.
   * @param mr Canonical MR identity.
   * @returns Sorted artifact identities, empty when none exist.
   */
  list(mr: string): Promise<string[]>;
}
