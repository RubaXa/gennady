// @file: Deterministic in-memory implementation of ArtifactStorePort.
// @consumers: inbox-core contract tests, inbox-mocks
// @tasks: TSK-173

import type { ArtifactStorePort } from '../ports/artifact-store.port.ts';

/**
 * @purpose Retain exact artifact bytes in isolated deterministic test memory.
 * @implements {ArtifactStorePort} in ../ports/artifact-store.port.ts
 */
export class InMemoryArtifactStore implements ArtifactStorePort {
  /** @see {ArtifactStorePort#identity} in ../ports/artifact-store.port.ts */
  readonly identity = 'in-memory-artifact-store';

  /** @see {ArtifactStorePort#health} in ../ports/artifact-store.port.ts */
  health(): { status: 'healthy' } {
    return { status: 'healthy' };
  }

  /** @purpose Isolated MR-and-id keyed artifact byte copies. */
  protected _artifacts = new Map<string, Uint8Array>();

  /** @see {ArtifactStorePort#put} in ../ports/artifact-store.port.ts */
  async put(address: { mr: string; id: string }, content: Uint8Array): Promise<void> {
    if (!address.mr || !address.id) {
      throw new Error('[InMemoryArtifactStore#put] Artifact address is invalid');
    }
    this._artifacts.set(`${address.mr}\u0000${address.id}`, content.slice());
  }

  /** @see {ArtifactStorePort#read} in ../ports/artifact-store.port.ts */
  async read(address: { mr: string; id: string }): Promise<Uint8Array> {
    const content = this._artifacts.get(`${address.mr}\u0000${address.id}`);
    if (!content) {
      throw new Error('[InMemoryArtifactStore#read] Artifact does not exist');
    }
    return content.slice();
  }

  /** @see {ArtifactStorePort#list} in ../ports/artifact-store.port.ts */
  async list(mr: string): Promise<string[]> {
    const prefix = `${mr}\u0000`;
    return [...this._artifacts.keys()]
      .filter((key) => key.startsWith(prefix))
      .map((key) => key.slice(prefix.length))
      .sort();
  }
}
