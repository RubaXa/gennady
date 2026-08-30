// @file: Structural scope decomposition — canonical scope type, declared Module Map members, and module-spec closure.
// @consumers: sdd-state.cmd, sdd-new.cmd, sdd-check.cmd
// @tasks: N/A

import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  type Dirent,
} from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { inspectRepoPath } from '../common/repo-path.ts';
import { extractSection } from './section.ts';

/** @purpose Directory names never descended into while walking specs/. */
const SKIP_DIRS = new Set(['node_modules', '.git']);

/** @purpose Canonical values accepted inside SCOPE_TYPE. */
export const SCOPE_TYPES = ['product', 'library', 'infrastructure', 'interface'] as const;
/** @purpose One canonical SCOPE_TYPE literal. */
export type ScopeType = (typeof SCOPE_TYPES)[number];

/** @purpose Structural decomposition result shared by review and scaffold gates. */
export type ScopeDecomposition = {
  /** @purpose Absolute scope-spec path inspected by the gate. */
  scopeSpec: string;
  /** @purpose Canonical scope type when classification succeeded. */
  scopeType?: ScopeType;
  /** @purpose Whether decomposition is complete, flat, inapplicable, or invalid. */
  status: 'complete' | 'flat' | 'not-applicable' | 'invalid';
  /** @purpose Canonical absolute module specs discovered under the scope. */
  moduleSpecs: string[];
  /** @purpose Actionable explanation for a non-success status. */
  reason?: string;
};

/** @purpose Result of resolving a module spec to its one structurally complete owning scope. */
type ModuleScopeOwnership =
  | {
      /** @purpose Successful structural ownership state. */
      status: 'owned';
      /** @purpose Complete owning product/library decomposition. */
      decomposition: ScopeDecomposition & { scopeType: 'product' | 'library'; status: 'complete' };
    }
  | {
      /** @purpose Fail-closed ownership state. */
      status: 'invalid';
      /** @purpose Actionable missing, ambiguous, undeclared, or incomplete reason. */
      reason: string;
    };

/** @purpose Structural ownership of one task at scope or declared-module level. */
type TaskOwnership =
  | {
      /** @purpose Ownership was proved from the canonical scope decomposition. */
      status: 'owned';
      /** @purpose Complete product/library or explicit flat infrastructure decomposition. */
      decomposition: ScopeDecomposition;
      /** @purpose Canonical module spec for a module-owned task; absent for a scope-owned task. */
      moduleSpec?: string;
    }
  | {
      /** @purpose Ownership could not be proved. */
      status: 'invalid';
      /** @purpose Actionable ghost, undeclared, ambiguous, or incomplete reason. */
      reason: string;
    };

/** @purpose Scope/module ownership inferred from an explicit task output path. */
type TaskOutputOwnership = {
  /** @purpose One SCOPE_TYPE-bearing ancestor, when structurally identifiable. */
  scope?: string;
  /** @purpose Deepest declared module subtree containing the output path. */
  module?: string;
  /** @purpose Fail-closed zero/ambiguous/invalid ownership reason. */
  reason?: string;
};

/**
 * @purpose Read one canonical SCOPE_TYPE literal without accepting prose.
 * @param content Full scope-spec markdown.
 * @returns Canonical type or a fail-closed reason.
 */
function resolveScopeType(content: string): { type?: ScopeType; reason?: string } {
  const section = extractSection(content, 'SCOPE_TYPE');
  if (section.status !== 'ok') {
    return { reason: `SCOPE_TYPE is ${section.status.replace('_', ' ')}` };
  }
  const values = section.content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^#{1,6}\s+scope-type$/i.test(line));
  if (values.length !== 1) {
    return {
      reason:
        values.length === 0
          ? 'SCOPE_TYPE has no canonical literal'
          : `SCOPE_TYPE must contain exactly one literal (found ${values.length} content lines)`,
    };
  }
  const type = (values[0] as string).replace(/^`|`$/g, '');
  if (!(SCOPE_TYPES as readonly string[]).includes(type)) {
    return { reason: `SCOPE_TYPE literal is unsupported (${type})` };
  }
  return { type: type as ScopeType };
}

/** @purpose Collect canonical MODULE_VISION specs under one scope, without following symlinks. */
function collectModuleSpecs(
  scopeDir: string,
  enforceCanonical = true
): { paths: string[]; errors: string[] } {
  const paths: string[] = [];
  const errors: string[] = [];
  function walk(dir: string): void {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      errors.push(`cannot read module directory ${relative(scopeDir, dir) || '.'}`);
      return;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(path);
      } else if (entry.name.endsWith('.spec.md')) {
        let content: string;
        try {
          content = readFileSync(path, 'utf-8');
        } catch {
          errors.push(`cannot read candidate module spec ${relative(scopeDir, path)}`);
          continue;
        }
        if (!content.includes('<!--SECTION:MODULE_VISION-->')) continue;
        if (enforceCanonical && basename(dirname(path)) !== basename(path, '.spec.md')) {
          errors.push(
            `module spec ${relative(scopeDir, path)} does not match <module>/<module>.spec.md`
          );
          continue;
        }
        paths.push(resolve(path));
      }
    }
  }
  walk(scopeDir);
  return { paths: paths.sort(), errors };
}

/** @purpose Parse explicit local `*.spec.md` members from the canonical MODULE_MAP section. */
function declaredModuleSpecs(scopeSpec: string, body: string): string[] {
  const paths: string[] = [];
  for (const match of body.matchAll(/\[[^\]]+\]\((<?[^)]+?\.spec\.md(?:#[^)>]*)?>?)\)/g)) {
    const raw = (match[1] as string).replace(/^<|>$/g, '').split('#')[0] as string;
    paths.push(resolve(dirname(scopeSpec), raw));
  }
  return paths;
}

/**
 * @purpose Prove one scope's decomposition from its declared Module Map and the canonical module specs on disk.
 * @invariant Product/library are complete only when the non-empty declared set exactly equals the discovered set.
 * @invariant Infrastructure is the sole `flat` result; interface is explicitly not task-decomposable.
 * @param scopeSpec Scope spec whose Module Map owns decomposition.
 * @returns Structural decomposition result and canonical module members.
 */
export function resolveScopeDecomposition(scopeSpec: string): ScopeDecomposition {
  const absoluteScope = resolve(scopeSpec);
  let content: string;
  try {
    content = readFileSync(absoluteScope, 'utf-8');
  } catch {
    return {
      scopeSpec: absoluteScope,
      status: 'invalid',
      moduleSpecs: [],
      reason: 'scope spec is missing or unreadable',
    };
  }
  const classification = resolveScopeType(content);
  if (!classification.type) {
    return {
      scopeSpec: absoluteScope,
      status: 'invalid',
      moduleSpecs: [],
      reason: classification.reason,
    };
  }
  if (classification.type === 'infrastructure') {
    return {
      scopeSpec: absoluteScope,
      scopeType: classification.type,
      status: 'flat',
      moduleSpecs: [],
    };
  }
  if (classification.type === 'interface') {
    return {
      scopeSpec: absoluteScope,
      scopeType: classification.type,
      status: 'not-applicable',
      moduleSpecs: [],
      reason: 'interface scopes have no direct task-scaffold route',
    };
  }

  const map = extractSection(content, 'MODULE_MAP');
  if (map.status !== 'ok') {
    return {
      scopeSpec: absoluteScope,
      scopeType: classification.type,
      status: 'invalid',
      moduleSpecs: [],
      reason: `MODULE_MAP is ${map.status.replace('_', ' ')}`,
    };
  }
  const scopeDir = dirname(absoluteScope);
  const declared = declaredModuleSpecs(absoluteScope, map.content);
  const errors: string[] = [];
  if (declared.length === 0) errors.push('MODULE_MAP declares zero module specs');
  if (new Set(declared).size !== declared.length)
    errors.push('MODULE_MAP contains duplicate members');
  for (const path of declared) {
    const rel = relative(scopeDir, path);
    if (
      rel.startsWith(`..${sep}`) ||
      rel === '..' ||
      basename(dirname(path)) !== basename(path, '.spec.md')
    ) {
      errors.push(`declared member ${rel} is not a canonical in-scope <module>/<module>.spec.md`);
      continue;
    }
    let isFile = false;
    try {
      isFile = statSync(path).isFile();
    } catch {
      // Rendered below as missing/unreadable structural evidence.
    }
    if (!isFile) {
      errors.push(`declared module spec ${rel} is missing`);
      continue;
    }
    let member: string;
    try {
      member = readFileSync(path, 'utf-8');
    } catch {
      errors.push(`declared module spec ${rel} is unreadable`);
      continue;
    }
    if (!member.includes('<!--SECTION:MODULE_VISION-->')) {
      errors.push(`declared member ${rel} is not a module spec`);
    }
  }
  const discovered = collectModuleSpecs(scopeDir);
  errors.push(...discovered.errors);
  const declaredReal = declared
    .filter((path) => existsSync(path))
    .map((path) => {
      try {
        return realpathSync(path);
      } catch {
        return path;
      }
    });
  if (new Set(declaredReal).size !== declaredReal.length) {
    errors.push('MODULE_MAP has ambiguous aliases resolving to one module spec');
  }
  const declaredSet = new Set(declared.map((path) => resolve(path)));
  const discoveredSet = new Set(discovered.paths);
  for (const path of discoveredSet) {
    if (!declaredSet.has(path))
      errors.push(`module spec ${relative(scopeDir, path)} is undeclared`);
  }
  for (const path of declaredSet) {
    if (!discoveredSet.has(path))
      errors.push(`declared member ${relative(scopeDir, path)} is unresolved`);
  }
  if (errors.length > 0) {
    return {
      scopeSpec: absoluteScope,
      scopeType: classification.type,
      status: 'invalid',
      moduleSpecs: discovered.paths,
      reason: [...new Set(errors)].join('; '),
    };
  }
  return {
    scopeSpec: absoluteScope,
    scopeType: classification.type,
    status: 'complete',
    moduleSpecs: discovered.paths,
  };
}

/**
 * @purpose Prove that a task belongs to its scope or to one exact declared module.
 * @param scopeSpec Canonical owning scope spec.
 * @param [module] Optional nested module path relative to the scope.
 * @returns Owned decomposition/module spec, or a fail-closed reason.
 */
export function resolveTaskOwnership(scopeSpec: string, module?: string): TaskOwnership {
  const decomposition = resolveScopeDecomposition(scopeSpec);
  if (decomposition.status !== 'complete' && decomposition.status !== 'flat') {
    return {
      status: 'invalid',
      reason: decomposition.reason ?? `scope decomposition is ${decomposition.status}`,
    };
  }
  if (!module) return { status: 'owned', decomposition };
  if (decomposition.status !== 'complete') {
    return { status: 'invalid', reason: 'a flat infrastructure scope cannot own a module task' };
  }
  const leaf = module.split('/').at(-1) ?? module;
  const expected = resolve(dirname(decomposition.scopeSpec), module, `${leaf}.spec.md`);
  let expectedReal: string;
  try {
    expectedReal = realpathSync(expected);
  } catch {
    return {
      status: 'invalid',
      reason: `module '${module}' has no exact canonical ${module}/${leaf}.spec.md`,
    };
  }
  const matches = decomposition.moduleSpecs.filter((candidate) => {
    try {
      return realpathSync(candidate) === expectedReal;
    } catch {
      return false;
    }
  });
  if (matches.length !== 1 || resolve(matches[0] as string) !== expected) {
    return {
      status: 'invalid',
      reason:
        matches.length > 1
          ? `module '${module}' resolves ambiguously inside the scope decomposition`
          : `module '${module}' is not an exact declared member of the scope decomposition`,
    };
  }
  return { status: 'owned', decomposition, moduleSpec: expected };
}

/**
 * @purpose Infer both scope and deepest declared module ownership from an explicit task output path.
 * @invariant Filenames/extensions never imply ownership; only SCOPE_TYPE plus complete decomposition do.
 * @param out Explicit task output path.
 * @param [projectRoot] Project root containing specs/.
 * @returns Inferred ownership or a zero/ambiguous/invalid reason.
 */
export function resolveTaskOutputOwnership(
  out: string,
  projectRoot = process.cwd()
): TaskOutputOwnership {
  const inspected = inspectRepoPath(projectRoot, out, 'potential');
  if (!inspected.ok) return { reason: `unsafe \`--out\`: ${inspected.detail}` };
  const root = realpathSync(resolve(projectRoot));
  const specsRoot = join(root, 'specs');
  const target = inspected.absolute;
  const targetRel = relative(specsRoot, target);
  if (
    targetRel === '' ||
    targetRel === '..' ||
    targetRel.startsWith(`..${sep}`) ||
    resolve(specsRoot, targetRel) !== target
  ) {
    return { reason: '`--out` is outside specs/ and carries no owning scope context' };
  }
  const ownerSpecs: string[] = [];
  let current = dirname(target);
  while (current !== specsRoot && current.startsWith(`${specsRoot}${sep}`)) {
    const candidate = join(current, `${basename(current)}.spec.md`);
    try {
      const stat = lstatSync(candidate);
      if (stat.isSymbolicLink()) {
        return { reason: `\`--out\` owner spec is a symlink: ${relative(root, candidate)}` };
      }
      if (stat.isFile() && readFileSync(candidate, 'utf-8').includes('<!--SECTION:SCOPE_TYPE-->')) {
        ownerSpecs.push(candidate);
      }
    } catch {
      // Missing ancestor specs carry no ownership evidence.
    }
    current = dirname(current);
  }
  if (ownerSpecs.length !== 1) {
    return {
      reason:
        ownerSpecs.length === 0
          ? '`--out` has no canonical SCOPE_TYPE-bearing ancestor spec'
          : `\`--out\` has ambiguous scope owners (${ownerSpecs.map((path) => basename(dirname(path))).join(', ')})`,
    };
  }
  const scopeSpec = ownerSpecs[0] as string;
  const scope = basename(dirname(scopeSpec));
  const ownership = resolveTaskOwnership(scopeSpec);
  if (ownership.status === 'invalid') return { scope, reason: ownership.reason };
  if (ownership.decomposition.status === 'flat') return { scope };

  const scopeDir = dirname(scopeSpec);
  const candidates = ownership.decomposition.moduleSpecs
    .filter((spec) => {
      const moduleDir = dirname(realpathSync(spec));
      const rel = relative(moduleDir, target);
      return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..');
    })
    .sort((a, b) => dirname(b).length - dirname(a).length);
  if (candidates.length === 0) return { scope };
  const nearestLength = dirname(candidates[0] as string).length;
  if (candidates.filter((path) => dirname(path).length === nearestLength).length !== 1) {
    return { scope, reason: '`--out` has ambiguous module owners at the same depth' };
  }
  return {
    scope,
    module: relative(scopeDir, dirname(candidates[0] as string))
      .split(sep)
      .join('/'),
  };
}

/**
 * @purpose Resolve a canonical module spec to one complete owning product/library scope.
 * @param moduleSpec Module spec expected to belong to a scope Module Map.
 * @returns Structural ownership or a fail-closed reason.
 */
export function resolveModuleScopeOwnership(moduleSpec: string): ModuleScopeOwnership {
  const absoluteModule = resolve(moduleSpec);
  if (basename(dirname(absoluteModule)) !== basename(absoluteModule, '.spec.md')) {
    return { status: 'invalid', reason: 'module path is not canonical <module>/<module>.spec.md' };
  }
  let moduleContent: string;
  try {
    moduleContent = readFileSync(absoluteModule, 'utf-8');
  } catch {
    return { status: 'invalid', reason: 'module spec is missing or unreadable' };
  }
  if (!moduleContent.includes('<!--SECTION:MODULE_VISION-->')) {
    return { status: 'invalid', reason: 'artifact is not a MODULE_VISION module spec' };
  }

  const ownerSpecs: string[] = [];
  let current = dirname(absoluteModule);
  for (;;) {
    const candidate = join(current, `${basename(current)}.spec.md`);
    if (candidate !== absoluteModule) {
      try {
        if (readFileSync(candidate, 'utf-8').includes('<!--SECTION:SCOPE_TYPE-->')) {
          ownerSpecs.push(candidate);
        }
      } catch {
        // An absent ancestor spec is not ownership evidence; keep walking.
      }
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  if (ownerSpecs.length !== 1) {
    return {
      status: 'invalid',
      reason:
        ownerSpecs.length === 0
          ? 'module has no canonical SCOPE_TYPE-bearing owner'
          : `module has ambiguous owning scopes (${ownerSpecs.join(', ')})`,
    };
  }

  const decomposition = resolveScopeDecomposition(ownerSpecs[0] as string);
  if (
    decomposition.status !== 'complete' ||
    (decomposition.scopeType !== 'product' && decomposition.scopeType !== 'library')
  ) {
    return {
      status: 'invalid',
      reason: `owning scope decomposition is not complete (${decomposition.reason ?? decomposition.status})`,
    };
  }
  let moduleReal = absoluteModule;
  try {
    moduleReal = realpathSync(absoluteModule);
  } catch {
    // The earlier read succeeded; retain the lexical path if canonicalization later fails.
  }
  const declared = decomposition.moduleSpecs.some((path) => {
    try {
      return realpathSync(path) === moduleReal;
    } catch {
      return false;
    }
  });
  if (!declared) {
    return { status: 'invalid', reason: 'module is not a declared member of its owning scope' };
  }
  return {
    status: 'owned',
    decomposition: decomposition as ScopeDecomposition & {
      scopeType: 'product' | 'library';
      status: 'complete';
    },
  };
}

/**
 * @purpose Recursively count `.spec.md` files under a specs/ tree that carry the MODULE_VISION marker.
 * @invariant Read-only; a scope spec (SCOPE_TYPE, no MODULE_VISION) or the portal (README.md) is not counted.
 * @param specsDir Absolute path to the project's specs/ directory.
 * @returns Count of module-classified spec files; 0 when specsDir is absent or holds none.
 */
export function countModuleSpecs(specsDir: string): number {
  return collectModuleSpecs(specsDir, false).paths.length;
}
