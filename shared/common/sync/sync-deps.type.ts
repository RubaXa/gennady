// @file: Shared sync command dependencies type — SyncCmdDeps
// @consumers: sync.cmd.ts, sync-skills.cmd.ts
// @tasks: TSK-56

/**
 * @purpose Injectable dependencies for sync CLI commands.
 * @invariant All fields are optional to allow partial mocking in tests.
 * @invariant unlink and rmdir are no-op by default in the sync command; sync-skills provides real implementations.
 */
export type SyncCmdDeps = {
  /**
   * @purpose Read file from disk.
   * @param path File path.
   * @returns File contents as Buffer.
   */
  readFile?: (path: string) => Buffer;
  /**
   * @purpose Write file to disk.
   * @param path File path.
   * @param data File contents.
   */
  writeFile?: (path: string, data: Buffer) => void;
  /**
   * @purpose Create directory.
   * @param path Directory path.
   * @param [opts] Options.
   */
  mkdir?: (path: string, opts?: { recursive: boolean }) => void;
  /**
   * @purpose Get file stats.
   * @param path File path.
   * @returns Stats object with isDirectory and isFile.
   */
  stat?: (path: string) => { isDirectory(): boolean; isFile(): boolean };
  /**
   * @purpose List directory contents.
   * @param path Directory path.
   * @returns File names.
   */
  readdir?: (path: string) => string[];
  /**
   * @purpose Resolve gennady package subdirectory path.
   * @param projectRoot Project root directory.
   * @param subdir Subdirectory inside the gennady package.
   * @returns Absolute path or null if not found.
   */
  resolvePackageDir?: (projectRoot: string, subdir: string) => string | null;
  /** @purpose Standard output stream. */
  stdout?: NodeJS.WriteStream;
  /** @purpose Standard error stream. */
  stderr?: NodeJS.WriteStream;
  /**
   * @purpose Delete a file (no-op in sync, used by sync-skills).
   * @param path File path.
   */
  unlink?: (path: string) => void;
  /**
   * @purpose Delete a directory recursively (no-op in sync, used by sync-skills).
   * @param path Directory path.
   * @param [options] Options.
   */
  rmdir?: (path: string, options?: { recursive: boolean }) => void;
};
