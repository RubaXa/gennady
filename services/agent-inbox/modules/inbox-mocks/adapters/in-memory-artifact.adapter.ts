// @file: InMemoryArtifactAdapter — isolated in-memory artifact store implementing ArtifactStorePort.
// @consumers: ReviewScenario, inbox-mocks test suite
// @tasks: TSK-180

import type { ArtifactStorePort } from '../../inbox-core/ports/artifact-store.port.ts';

type ArtifactKey = `${string}::${string}`;

/**
 * @purpose Deterministic in-memory artifact store for isolated test scenarios without filesystem I/O.
 * @implements {ArtifactStorePort} in ../../inbox-core/ports/artifact-store.port.ts
 * @invariant A successful put is visible in subsequent reads within the same instance.
 * @invariant No network or filesystem fallback exists — absent artifact read fails the scenario.
 */
export class InMemoryArtifactAdapter implements ArtifactStorePort {
  /** @see {ArtifactStorePort#identity} in ../../inbox-core/ports/artifact-store.port.ts */
  readonly identity = 'in-memory-artifact-store';

  /** @purpose Keyed artifact storage using composite mr::id address. */
  protected _store: Map<ArtifactKey, Uint8Array> = new Map();

  /** @see {ArtifactStorePort#health} in ../../inbox-core/ports/artifact-store.port.ts */
  health(): { status: 'healthy' } {
    return { status: 'healthy' };
  }

  /**
   * @see {ArtifactStorePort#put} in ../../inbox-core/ports/artifact-store.port.ts
   * @throws {Error} When address mr or id is empty.
   */
  async put(address: { mr: string; id: string }, content: Uint8Array): Promise<void> {
    if (!address.mr || !address.id) {
      throw new Error('[InMemoryArtifactAdapter#put] Address mr and id must be non-empty');
    }
    this._store.set(`${address.mr}::${address.id}`, content);
  }

  /**
   * @see {ArtifactStorePort#read} in ../../inbox-core/ports/artifact-store.port.ts
   * @throws {Error} When the artifact does not exist — absent artifact fails the scenario.
   */
  async read(address: { mr: string; id: string }): Promise<Uint8Array> {
    const content = this._store.get(`${address.mr}::${address.id}`);
    if (!content) {
      throw new Error(
        `[InMemoryArtifactAdapter#read] Artifact not found: ${address.mr}::${address.id}`
      );
    }
    return content;
  }

  /** @see {ArtifactStorePort#list} in ../../inbox-core/ports/artifact-store.port.ts */
  async list(mr: string): Promise<string[]> {
    const prefix = `${mr}::`;
    const ids: string[] = [];
    for (const key of this._store.keys()) {
      if (key.startsWith(prefix)) {
        ids.push(key.slice(prefix.length));
      }
    }
    return ids.sort();
  }

  /**
   * @purpose Discard all stored artifacts — resets only this owned instance.
   * @sideEffect Clears all in-memory state.
   */
  reset(): void {
    this._store.clear();
  }
}
