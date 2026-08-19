// @file: Plugin resolver — one directory per plugin, manifest-declared surfaces, paths as data.
// @consumers: stack-registry, plugin-locality test, future sync/sync-skills/e2e lookups
// @tasks: TSK-96

import fs from 'node:fs';
import path from 'node:path';
import { isPlainObject, unknownKeyError, type ConfigError } from '../config/config-loader.ts';

/** Manifest filename — its presence is what makes a directory a plugin (plugins.spec §3). */
export const PLUGIN_MANIFEST_FILENAME = 'plugin.json';

/** Closed manifest schema; an unknown key is fatal with a did-you-mean (plugins.spec §4.2). */
export const PLUGIN_MANIFEST_KEYS = [
  'id',
  'kind',
  'entry',
  'specs',
  'directives',
  'skills',
  'e2eFixtures',
] as const;

/** Conventional defaults, applied only when the key is omitted (plugins.spec §4.2). */
const DEFAULTS = {
  entry: 'plugin.ts',
  specs: 'specs',
  directives: 'directives',
  skills: 'skills',
  e2eFixtures: 'e2e/fixtures',
} as const;

/** Surface keys carrying a path — everything except identity. */
type SurfaceKey = keyof typeof DEFAULTS;

/**
 * @purpose One plugin found on disk: identity plus absolute paths of its declared surfaces.
 * @invariant Every path is absolute and exists; an undeclared surface is empty or null.
 * @consumer stack-registry, plugin-locality test
 */
export type ResolvedPlugin = {
  /** @purpose Plugin id; equals its directory name. */
  readonly id: string;
  /** @purpose Plugin type; consumers ask for their own (plugins.spec D-SP-002). */
  readonly kind: string;
  /** @purpose The plugin directory itself. */
  readonly dir: string;
  /** @purpose Module exporting the plugin object; the resolver never imports it. */
  readonly entry: string;
  /** @purpose Root spec `<specs>/<id>.spec.md`, or null when the plugin ships no specs. */
  readonly specRoot: string | null;
  /** @purpose Every `*.spec.md` under the specs directory, root included. */
  readonly specs: readonly string[];
  /** @purpose Every `*.xml` under the directives directory. */
  readonly directives: readonly string[];
  /** @purpose Every `<name>/SKILL.md` under the skills directory. */
  readonly skills: readonly string[];
  /** @purpose Fixture root of the plugin's E2E suite, or null. */
  readonly e2eFixtures: string | null;
};

/** What one manifest yielded: a plugin, errors, or both when the plugin is unusable. */
type ManifestRead = {
  readonly plugin: ResolvedPlugin | null;
  readonly errors: readonly ConfigError[];
};

/**
 * @purpose Collect files under a directory matching a predicate, depth-first and sorted.
 * @param dir Absolute directory; assumed to exist.
 * @param keep Predicate on the entry name.
 * @returns Absolute paths, lexicographically sorted.
 */
function collectFiles(dir: string, keep: (name: string) => boolean): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...collectFiles(full, keep));
    } else if (keep(entry.name)) {
      found.push(full);
    }
  }
  return found.sort();
}

/**
 * @purpose Resolve one surface path, distinguishing a typo from a deliberate absence.
 * @invariant A declared-but-missing path is fatal; a defaulted-but-missing one is simply absent.
 * @param dir Plugin directory.
 * @param raw The manifest object as read.
 * @param key Surface key.
 * @param id Plugin id, for the error path.
 * @returns Absolute path plus its error, either of which may be null.
 */
function surfacePath(
  dir: string,
  raw: Record<string, unknown>,
  key: SurfaceKey,
  id: string
): { readonly resolved: string | null; readonly error: ConfigError | null } {
  const declared = raw[key];
  if (declared !== undefined && typeof declared !== 'string') {
    return {
      resolved: null,
      error: { path: `plugins.${id}.${key}`, message: 'must be a string path' },
    };
  }
  const value = declared ?? DEFAULTS[key];
  const resolved = path.join(dir, value);
  if (fs.existsSync(resolved)) {
    return { resolved, error: null };
  }
  if (declared === undefined) {
    return { resolved: null, error: null };
  }
  return {
    resolved: null,
    error: { path: `plugins.${id}.${key}`, message: `declared path does not exist: ${value}` },
  };
}

/**
 * @purpose Read and validate one plugin directory's manifest into a ResolvedPlugin.
 * @invariant `id` must equal the directory name — the first check, before any surface.
 * @param dir Absolute plugin directory.
 * @returns The plugin when usable, plus every problem found.
 */
function readManifest(dir: string): ManifestRead {
  const dirName = path.basename(dir);
  const manifestPath = path.join(dir, PLUGIN_MANIFEST_FILENAME);
  const keyPath = `plugins.${dirName}`;

  if (!fs.existsSync(manifestPath)) {
    return {
      plugin: null,
      errors: [{ path: keyPath, message: `missing ${PLUGIN_MANIFEST_FILENAME}` }],
    };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch (cause) {
    return {
      plugin: null,
      errors: [{ path: keyPath, message: `cannot parse JSON: ${(cause as Error).message}` }],
    };
  }
  if (!isPlainObject(raw)) {
    return { plugin: null, errors: [{ path: keyPath, message: 'must be a JSON object' }] };
  }

  const errors: ConfigError[] = [];
  for (const key of Object.keys(raw)) {
    if (!(PLUGIN_MANIFEST_KEYS as readonly string[]).includes(key)) {
      errors.push(unknownKeyError(`${keyPath}.${key}`, PLUGIN_MANIFEST_KEYS));
    }
  }

  //#region identity
  // The directory name is what a human sees and `id` is what code sees; a mismatch
  // yields a plugin that exists under a name nobody used.
  const { id, kind } = raw;
  if (typeof id !== 'string' || id.length === 0) {
    errors.push({ path: `${keyPath}.id`, message: 'required, must be a non-empty string' });
  } else if (id !== dirName) {
    errors.push({
      path: `${keyPath}.id`,
      message: `must equal the directory name "${dirName}", got "${id}"`,
    });
  }
  if (typeof kind !== 'string' || kind.length === 0) {
    errors.push({ path: `${keyPath}.kind`, message: 'required, must be a non-empty string' });
  }
  //#endregion

  if (errors.length > 0) {
    return { plugin: null, errors };
  }

  //#region surfaces
  // `entry` is the one surface a plugin cannot lack: without code there is nothing
  // to register. The rest may be absent when the manifest stays silent about them.
  const entry = surfacePath(dir, raw, 'entry', id as string);
  if (entry.error !== null) {
    errors.push(entry.error);
  } else if (entry.resolved === null) {
    errors.push({
      path: `${keyPath}.entry`,
      message: `missing plugin code: ${DEFAULTS.entry} not found and no entry declared`,
    });
  }

  const specsDir = surfacePath(dir, raw, 'specs', id as string);
  const directivesDir = surfacePath(dir, raw, 'directives', id as string);
  const skillsDir = surfacePath(dir, raw, 'skills', id as string);
  const fixturesDir = surfacePath(dir, raw, 'e2eFixtures', id as string);
  for (const surface of [specsDir, directivesDir, skillsDir, fixturesDir]) {
    if (surface.error !== null) {
      errors.push(surface.error);
    }
  }
  //#endregion

  //#region root spec
  // A spec set without an entry point answers nobody's "where do I start reading";
  // that is a typo class, not a deliberate omission.
  let specRoot: string | null = null;
  let specs: readonly string[] = [];
  if (specsDir.resolved !== null) {
    specRoot = path.join(specsDir.resolved, `${id as string}.spec.md`);
    if (!fs.existsSync(specRoot)) {
      errors.push({
        path: `${keyPath}.specs`,
        message: `missing root spec ${path.basename(specRoot)} in ${path.relative(dir, specsDir.resolved)}`,
      });
      specRoot = null;
    } else {
      specs = collectFiles(specsDir.resolved, (name) => name.endsWith('.spec.md'));
    }
  }
  //#endregion

  if (errors.length > 0) {
    return { plugin: null, errors };
  }

  return {
    plugin: {
      id: id as string,
      kind: kind as string,
      dir,
      entry: entry.resolved as string,
      specRoot,
      specs,
      directives:
        directivesDir.resolved === null
          ? []
          : collectFiles(directivesDir.resolved, (name) => name.endsWith('.xml')),
      skills:
        skillsDir.resolved === null
          ? []
          : collectFiles(skillsDir.resolved, (name) => name === 'SKILL.md'),
      e2eFixtures: fixturesDir.resolved,
    },
    errors: [],
  };
}

/**
 * @purpose Discover plugins under the given roots; paths are returned as data, never imported.
 * @invariant A missing root is not an error (an uninitialized submodule is simply absent).
 * @invariant Order is lexicographic by id so reports and plans never depend on readdir order.
 * @param roots Absolute directories to scan; each holds one directory per plugin.
 * @param [kind] Restrict to this plugin type; others are excluded without error.
 * @returns Resolved plugins and every problem found, errors never thrown.
 */
export function resolvePlugins(
  roots: readonly string[],
  kind?: string
): { readonly plugins: readonly ResolvedPlugin[]; readonly errors: readonly ConfigError[] } {
  const plugins: ResolvedPlugin[] = [];
  const errors: ConfigError[] = [];
  const seen = new Map<string, string>();

  for (const root of roots) {
    if (!fs.existsSync(root)) {
      continue;
    }
    for (const entry of fs.readdirSync(root, { withFileTypes: true }).sort()) {
      if (!entry.isDirectory()) {
        continue;
      }
      const read = readManifest(path.join(root, entry.name));
      errors.push(...read.errors);
      if (read.plugin === null) {
        continue;
      }
      const previous = seen.get(read.plugin.id);
      if (previous !== undefined) {
        errors.push({
          path: `plugins.${read.plugin.id}`,
          message: `duplicate plugin id, already resolved from ${previous}`,
        });
        continue;
      }
      seen.set(read.plugin.id, read.plugin.dir);
      plugins.push(read.plugin);
    }
  }

  const selected = kind === undefined ? plugins : plugins.filter((p) => p.kind === kind);
  return { plugins: selected.sort((a, b) => a.id.localeCompare(b.id)), errors };
}
