import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, extname, relative, resolve, sep } from 'node:path';

const STEP_PACKAGE_LINE_RE =
  /(?:Before executing this step|After completing this step, and only then),? READ_AND_USE_DIRECTIVE\("([^"]+)"\)\./g;

/** Read one lazy directive's bounded, package-local fragment chain. */
export function readAssembledFragments(
  absPath,
  { repoRoot, lazy, maxFragments = 128 }
) {
  const skeletonText = readFileSync(absPath, 'utf8');
  const fragments = [skeletonText];
  if (!lazy) return fragments;

  const visited = new Set([resolve(absPath)]);
  const active = new Set();

  function visitPackage(ref, owner) {
    const packagePath = resolve(repoRoot, ref);
    const relToPackage = relative(
      resolve(
        dirname(absPath),
        basename(absPath, extname(absPath)).replace(/\.directive$/, '')
      ),
      packagePath
    );
    if (
      relToPackage === '..' ||
      relToPackage.startsWith(`..${sep}`) ||
      relToPackage.startsWith(sep)
    )
      throw new Error(`step-package ref escapes its directive package: ${owner} -> ${ref}`);
    if (!existsSync(packagePath))
      throw new Error(`missing step-package ref: ${owner} -> ${ref}`);
    if (active.has(packagePath))
      throw new Error(`cyclic step-package ref: ${owner} -> ${ref}`);
    if (visited.has(packagePath)) return;
    if (visited.size >= maxFragments)
      throw new Error(`step-package traversal exceeds ${maxFragments} fragments for ${absPath}`);

    visited.add(packagePath);
    active.add(packagePath);
    const text = readFileSync(packagePath, 'utf8');
    fragments.push(text);
    for (const match of text.matchAll(STEP_PACKAGE_LINE_RE)) visitPackage(match[1], ref);
    active.delete(packagePath);
  }

  active.add(resolve(absPath));
  for (const match of skeletonText.matchAll(STEP_PACKAGE_LINE_RE))
    visitPackage(match[1], relative(repoRoot, absPath));
  active.delete(resolve(absPath));
  return fragments;
}
