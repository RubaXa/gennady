// @file: Fresh runner-owned CLI build capability for black-box tests; source coverage stays separate.
// @spec: INFRA-BASE
// @consumers: test-topology, tool-behavior real CLI helpers

import { createHash, randomUUID } from 'node:crypto';
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

export const TEST_CLI_BUNDLE_ENV = 'GENNADY_TEST_CLI_BUNDLE_MANIFEST';
const SOURCE_ROOTS = [
  'cli',
  'shared',
  'services',
  'plugins',
  'utils',
  'ai/directives',
  'ai/skills',
  'ai/kit',
];
const ownedBundles = new WeakSet<TestCliBundle>();
const validatedOutputs = new Set<string>();
const SOURCE_EXCLUDED = new Set(['__tests__', 'node_modules', 'dist', 'coverage', 'e2e']);

/** @purpose Runner-owned capability issued only after a fresh build and unchanged source snapshot. */
export type TestCliBundle = {
  root: string;
  manifestPath: string;
  sourceDigest: string;
  outputDigest: string;
};

/** @purpose Hash exact bytes instead of relying on source or output timestamps. */
function digest(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

/** @purpose Enumerate ordinary files in an owned source/artifact tree without following aliases. */
function treeFiles(root: string, directory: string, source = false): string[] {
  const found: string[] = [];
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    if (source && (item.name.startsWith('.') || SOURCE_EXCLUDED.has(item.name))) continue;
    const path = join(directory, item.name);
    if (item.isSymbolicLink())
      throw new Error('TEST_CLI_UNSAFE_ALIAS: source/artifact must be ordinary files');
    if (item.isDirectory()) found.push(...treeFiles(root, path, source));
    else if (item.isFile()) found.push(relative(root, path).split(sep).join('/'));
  }
  return found;
}

/** @purpose Bind every local production/input byte, excluding tests, dependencies and research output. */
function sourceDigest(root: string): string {
  const paths = SOURCE_ROOTS.flatMap((name) => {
    const path = join(root, name);
    try {
      if (lstatSync(path).isSymbolicLink())
        throw new Error('TEST_CLI_UNSAFE_ALIAS: source root alias');
      return treeFiles(root, path, true);
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw cause;
    }
  });
  for (const item of readdirSync(root, { withFileTypes: true })) {
    if (item.isFile() && /\.(?:[cm]?[jt]sx?|json)$/.test(item.name)) paths.push(item.name);
  }
  return digest(
    JSON.stringify(
      [...new Set(paths)].sort().map((path) => [path, digest(readFileSync(join(root, path)))])
    )
  );
}

/** @purpose Bind the complete built output, not just an entrypoint referencing mutable chunks. */
function outputDigest(root: string): string {
  return digest(
    JSON.stringify(
      treeFiles(root, join(root, 'dist'))
        .sort()
        .map((path) => [path, digest(readFileSync(join(root, path)))])
    )
  );
}

/**
 * @purpose Build exactly once for one runner mode and issue a source-bound temporary capability.
 * @param root Repository whose current production source is built.
 * @param options Sanitized build environment and an injectable compiler only for isolated controls.
 * @returns Capability; failure never falls back to an older dist.
 */
export function prepareTestCliBundle(
  root: string,
  options: { env: NodeJS.ProcessEnv; build?: () => void }
): TestCliBundle {
  root = realpathSync(resolve(root));
  const before = sourceDigest(root);
  if (options.build) options.build();
  else {
    // Match ordinary `vite build`: a test runner must not compile dependency devtools.
    // Only this compiler child uses production; source/unit test environments stay unchanged.
    const env: NodeJS.ProcessEnv = { ...options.env, NODE_ENV: 'production' };
    delete env[TEST_CLI_BUNDLE_ENV];
    const result = spawnSync(
      process.execPath,
      [join(root, 'node_modules/vite/bin/vite.js'), 'build'],
      {
        cwd: root,
        env,
        stdio: 'inherit',
        timeout: 120_000,
      }
    );
    if (result.error || result.status !== 0)
      throw new Error('TEST_CLI_BUILD_FAILED: fresh Vite build is required');
  }
  if (sourceDigest(root) !== before)
    throw new Error('TEST_CLI_SOURCE_DRIFT: source changed during fresh build');
  const entry = join(root, 'dist/gennady.js');
  if (!lstatSync(entry).isFile() || lstatSync(entry).isSymbolicLink())
    throw new Error('TEST_CLI_BUILD_INVALID: ordinary CLI entrypoint is required');
  const outputs = outputDigest(root);
  const directory = mkdtempSync(join(tmpdir(), 'gennady-test-cli-bundle-'));
  const manifestPath = join(directory, 'manifest.json');
  try {
    writeFileSync(
      manifestPath,
      JSON.stringify({
        schema: 1,
        producer: 'test-topology-fresh-vite-build',
        nonce: randomUUID(),
        root,
        entry,
        entrySha256: digest(readFileSync(entry)),
        sourceDigest: before,
        outputDigest: outputs,
        nodeAbi: process.versions.modules,
      }) + '\n',
      { mode: 0o600, flag: 'wx' }
    );
    const capability = Object.freeze({
      root,
      manifestPath,
      sourceDigest: before,
      outputDigest: outputs,
    });
    ownedBundles.add(capability);
    return capability;
  } catch (cause) {
    rmSync(directory, { recursive: true, force: true });
    throw cause;
  }
}

/** @purpose Refuse a successful mode if source or any built chunk changed while its tests ran. */
export function verifyTestCliBundle(bundle: TestCliBundle): void {
  if (!ownedBundles.has(bundle)) throw new Error('TEST_CLI_BUNDLE_INVALID: foreign capability');
  if (sourceDigest(bundle.root) !== bundle.sourceDigest)
    throw new Error('TEST_CLI_SOURCE_DRIFT: source changed during black-box tests');
  if (outputDigest(bundle.root) !== bundle.outputDigest)
    throw new Error('TEST_CLI_OUTPUT_DRIFT: built output changed during black-box tests');
}

/** @purpose Remove only the runner-owned manifest, preserving the reusable build and dependencies. */
export function releaseTestCliBundle(bundle: TestCliBundle): void {
  if (!ownedBundles.has(bundle)) throw new Error('TEST_CLI_BUNDLE_INVALID: foreign capability');
  rmSync(dirname(bundle.manifestPath), { recursive: true, force: true });
  ownedBundles.delete(bundle);
}

/**
 * @purpose Select only an explicitly passed fresh build; ordinary standalone suites keep source CLI.
 * @param root Expected repository root, never caller-provided CLI code.
 * @param environment Test-worker environment; nested product commands must strip this capability.
 * @returns Exact compiled entry, or undefined for the existing source path.
 */
export function readTestCliBundleEntry(
  root: string,
  environment: NodeJS.ProcessEnv
): string | undefined {
  const file = environment[TEST_CLI_BUNDLE_ENV];
  if (file === undefined) return undefined;
  if (
    basename(file) !== 'manifest.json' ||
    !basename(dirname(file)).startsWith('gennady-test-cli-bundle-')
  )
    throw new Error('TEST_CLI_BUNDLE_INVALID: expected an owned temporary manifest');
  if (lstatSync(file).isSymbolicLink() || lstatSync(dirname(file)).isSymbolicLink())
    throw new Error('TEST_CLI_BUNDLE_INVALID: manifest aliases are forbidden');
  const bytes = readFileSync(file);
  const parsed = JSON.parse(bytes.toString('utf8'));
  const canonical = realpathSync(resolve(root));
  const entry = join(canonical, 'dist/gennady.js');
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    parsed.schema !== 1 ||
    parsed.producer !== 'test-topology-fresh-vite-build' ||
    parsed.root !== canonical ||
    parsed.entry !== entry ||
    parsed.nodeAbi !== process.versions.modules ||
    typeof parsed.nonce !== 'string' ||
    !parsed.nonce ||
    !/^[a-f0-9]{64}$/.test(parsed.sourceDigest) ||
    !/^[a-f0-9]{64}$/.test(parsed.outputDigest) ||
    parsed.entrySha256 !== digest(readFileSync(entry))
  )
    throw new Error('TEST_CLI_BUNDLE_INVALID: no matching runner-owned fresh CLI build');
  const identity = file + ':' + digest(bytes);
  if (!validatedOutputs.has(identity)) {
    if (outputDigest(canonical) !== parsed.outputDigest)
      throw new Error('TEST_CLI_OUTPUT_DRIFT: built chunks do not match their fresh build');
    validatedOutputs.add(identity);
  }
  return entry;
}
