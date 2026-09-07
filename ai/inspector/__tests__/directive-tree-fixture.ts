import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export type DirectiveTreeFixture = {
  readonly directivesRoot: string;
  readonly read: (ref: string) => string | null;
  cleanup(): void;
};

/** Build the generated directive tree outside the repository for hermetic inspector tests. */
export function buildDirectiveTreeFixture(repoRoot: string): DirectiveTreeFixture {
  const directivesRoot = mkdtempSync(join(tmpdir(), 'gennady-inspector-directives-'));
  const result = spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      join(repoRoot, 'ai/kit/build-directives.ts'),
      `--out=${directivesRoot}`,
    ],
    { cwd: repoRoot, encoding: 'utf8' }
  );
  if (result.status !== 0) {
    rmSync(directivesRoot, { recursive: true, force: true });
    throw new Error(`isolated directive build failed:\n${result.stdout}\n${result.stderr}`);
  }

  return {
    directivesRoot,
    read(ref: string): string | null {
      const prefix = 'ai/directives/';
      const path = ref.startsWith(prefix)
        ? resolve(directivesRoot, ref.slice(prefix.length))
        : resolve(repoRoot, ref);
      return existsSync(path) ? readFileSync(path, 'utf8') : null;
    },
    cleanup(): void {
      rmSync(directivesRoot, { recursive: true, force: true });
    },
  };
}
