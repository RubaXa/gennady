// @file: Profile-rooted atomic filesystem implementation of ArtifactStorePort.
// @consumers: production composition root
// @tasks: TSK-173

import { mkdir, open, readFile, readdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { logger } from '#logger';
import type { ArtifactStorePort } from '../ports/artifact-store.port.ts';

/** @purpose Encode an address segment without permitting path traversal. */
function encodeAddress(value: string): string {
  if (value.length === 0) throw new Error('[encodeAddress] Address segment cannot be empty');
  return Buffer.from(value, 'utf8').toString('base64url');
}

/** @purpose Decode one artifact identity exposed by list. */
function decodeAddress(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

/**
 * @purpose Store review artifact bytes atomically under a validated runtime state root.
 * @implements {ArtifactStorePort} in ../ports/artifact-store.port.ts
 * @invariant Failed write/fsync/rename is logged and never acknowledged.
 */
export class LocalArtifactStore implements ArtifactStorePort {
  /** @see {ArtifactStorePort#identity} in ../ports/artifact-store.port.ts */
  readonly identity = 'local-artifact-store';
  /** @purpose Profile-owned artifact root beneath the validated state namespace. */
  protected readonly _root: string;
  /** @purpose Latest adapter failure exposed through the health surface. */
  protected _healthFailure: string | null = null;

  /** @see {ArtifactStorePort#health} in ../ports/artifact-store.port.ts */
  health(): { status: 'healthy' | 'failed'; detail?: string } {
    return this._healthFailure
      ? { status: 'failed', detail: this._healthFailure }
      : { status: 'healthy' };
  }

  /**
   * @purpose Bind artifacts to the already validated StateStore runtime root.
   * @param stateRoot Validated StateStore runtime root.
   */
  constructor(stateRoot: string) {
    this._root = join(stateRoot, 'agent-inbox', 'artifacts');
  }

  /** @see {ArtifactStorePort#put} in ../ports/artifact-store.port.ts */
  async put(address: { mr: string; id: string }, content: Uint8Array): Promise<void> {
    const directory = join(this._root, encodeAddress(address.mr));
    const target = join(directory, encodeAddress(address.id));
    const temporary = `${target}.${randomUUID()}.tmp`;
    // #region START_DURABLE_ATOMIC_ARTIFACT_WRITE
    try {
      await mkdir(directory, { recursive: true });
      const handle = await open(temporary, 'wx');
      try {
        await handle.writeFile(content);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, target);
      this._healthFailure = null;
    } catch (cause) {
      const error = new Error('[LocalArtifactStore#put] Durable artifact write failed', { cause });
      this._healthFailure = error.message;
      logger.error('[LocalArtifactStore#put] [writing → failed]', { error, target });
      throw error;
    }
    // #endregion END_DURABLE_ATOMIC_ARTIFACT_WRITE
  }

  /** @see {ArtifactStorePort#read} in ../ports/artifact-store.port.ts */
  async read(address: { mr: string; id: string }): Promise<Uint8Array> {
    const target = join(this._root, encodeAddress(address.mr), encodeAddress(address.id));
    // #region START_READ_EXACT_ARTIFACT_BYTES
    try {
      return new Uint8Array(await readFile(target));
    } catch (cause) {
      const error = new Error('[LocalArtifactStore#read] Artifact read failed', { cause });
      this._healthFailure = error.message;
      logger.error('[LocalArtifactStore#read] [reading → failed]', { error, target });
      throw error;
    }
    // #endregion END_READ_EXACT_ARTIFACT_BYTES
  }

  /** @see {ArtifactStorePort#list} in ../ports/artifact-store.port.ts */
  async list(mr: string): Promise<string[]> {
    const directory = join(this._root, encodeAddress(mr));
    // #region START_LIST_STABLE_ARTIFACT_IDENTITIES
    try {
      return (await readdir(directory))
        .filter((name) => !name.endsWith('.tmp'))
        .map(decodeAddress)
        .sort();
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return [];
      const error = new Error('[LocalArtifactStore#list] Artifact listing failed', { cause });
      this._healthFailure = error.message;
      logger.error('[LocalArtifactStore#list] [listing → failed]', { error, directory });
      throw error;
    }
    // #endregion END_LIST_STABLE_ARTIFACT_IDENTITIES
  }
}
