// @file: Real local build/pack/install acceptance for the four declared package entrypoints.
// @spec: INFRA-NPM-PUBLISH
// @consumers: deterministic package regression suite

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { builtinModules } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';
import ts from 'typescript';
import { cleanTestChildEnv } from '../../cli/__tests__/tool-behavior/run-cli.ts';

const ROOT = resolve(import.meta.dirname, '../..');
const ENTRIES = {
  '.': ['createMonitor', 'diff', 'observe', 'DuplicateProviderError', 'ProviderNotFoundError'],
  './providers/claude': [
    'ClaudeProvider',
    'psInfo',
    'parseClaudeArgs',
    'readSessionJson',
    'readSessionTitle',
  ],
  './providers/opencode': [
    'OpenCodeProvider',
    'querySessions',
    'queryLastMessage',
    'parseModelJson',
  ],
  './stack': [
    'loadVerifyConfig',
    'VerifyConfigError',
    'composePresets',
    'resolveSddVerifySelector',
    'selectPhase',
    'resolveDependencies',
    'validatePlan',
    'VerifyPlanError',
    'allOf',
    'exitCodeMatches',
    'outputMatches',
    'streamMatches',
    'parseDuration',
    'execFileTrimSafe',
  ],
} as const;

type PackageShape = {
  main: string;
  types: string;
  dependencies: Record<string, string>;
  exports: Record<string, string | { types: string; import: string; default: string }>;
};
const context = {
  fixture: '',
  build: '',
  consumer: '',
  installed: '',
  manifest: null as PackageShape | null,
  files: new Set<string>(),
};

function run(command: string, args: string[], cwd: string): string {
  const { fixture } = context;
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 16 * 1024 * 1024,
    env: {
      ...cleanTestChildEnv(process.env),
      // This port builds and imports production artifacts, even under NODE_ENV=test topology.
      NODE_ENV: 'production',
      HOME: join(fixture, 'home'),
      NODE_PATH: '',
      NODE_OPTIONS: '',
      NODE_NO_WARNINGS: '1',
      npm_config_cache: join(fixture, 'cache'),
      npm_config_userconfig: join(fixture, 'empty.npmrc'),
      npm_config_offline: 'true',
    },
  });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')}\n${result.error ?? ''}\n${result.stdout}\n${result.stderr}`
  );
  return result.stdout;
}

function targets(entry: string): { js: string; types: string } {
  const { manifest } = context;
  assert.ok(manifest);
  const target = manifest.exports[entry];
  return typeof target === 'string'
    ? { js: target, types: target }
    : { js: target.import, types: target.types };
}

function assertClosure(path: string, declarations = true, visited = new Set<string>()): void {
  if (visited.has(path)) return;
  visited.add(path);
  const { installed, manifest, files } = context;
  const shippedPath = relative(installed, path).split('\\').join('/');
  assert.ok(!shippedPath.startsWith('../'), `package closure escaped to ${path}`);
  assert.ok(files.has(shippedPath), `not shipped in tarball: ${shippedPath}`);
  assert.ok(existsSync(path), `dangling package reference: ${path}`);
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest);
  const imports: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      imports.push(node.moduleSpecifier.text);
    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    )
      imports.push(node.argument.literal.text);
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    )
      imports.push(node.arguments[0].text);
    if (
      ts.isExternalModuleReference(node) &&
      node.expression &&
      ts.isStringLiteral(node.expression)
    )
      imports.push(node.expression.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  for (const specifier of imports) {
    assert.doesNotMatch(
      specifier,
      /\.ts$|^#/,
      `source-only package import in ${path}: ${specifier}`
    );
    if (specifier.startsWith('.')) {
      assertClosure(
        resolve(dirname(path), declarations ? specifier.replace(/\.js$/, '.d.ts') : specifier),
        declarations,
        visited
      );
    } else if (
      !declarations &&
      !builtinModules.includes(specifier) &&
      !builtinModules.includes(specifier.replace(/^node:/, ''))
    ) {
      const name = specifier.startsWith('@')
        ? specifier.split('/').slice(0, 2).join('/')
        : specifier.split('/')[0];
      assert.ok(manifest?.dependencies[name], `unbundled non-runtime dependency: ${specifier}`);
      assert.ok(
        existsSync(join(context.consumer, 'node_modules', name, 'package.json')),
        `missing installed runtime dependency: ${name}`
      );
    }
  }
}

describe('declared local package exports (R3)', () => {
  before(() => {
    context.fixture = mkdtempSync(join(tmpdir(), 'gennady-declared-exports-'));
    const { fixture } = context;
    const build = (context.build = join(fixture, 'build'));
    const consumer = (context.consumer = join(fixture, 'consumer'));
    mkdirSync(build);
    mkdirSync(consumer);
    writeFileSync(join(fixture, 'empty.npmrc'), '');
    for (const path of [
      'package.json',
      'package-lock.json',
      '.npmignore',
      'vite.config.ts',
      'tsconfig.json',
      'tsconfig.types.json',
      'index.ts',
      'README.md',
      'cli',
      'services',
      'shared',
      'plugins',
      'utils',
      'scripts',
      'ai',
    ]) {
      cpSync(join(ROOT, path), join(build, path), {
        recursive: true,
        filter: (source) =>
          !source.includes('/__tests__/') &&
          !source.endsWith('.test.ts') &&
          !source.includes('/drafts/'),
      });
    }
    symlinkSync(realpathSync(join(ROOT, 'node_modules')), join(build, 'node_modules'), 'dir');
    run('npm', ['run', 'build'], build);
    run('npm', ['run', 'build:types'], build);
    const [pack] = JSON.parse(
      run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', fixture], build)
    ) as Array<{ filename: string; files: Array<{ path: string }> }>;
    context.files = new Set(pack.files.map(({ path }) => path));

    // Physical copies of already installed runtime dependencies allow npm to install the exact
    // tarball offline, without registry credentials/cache, symlink or ancestor module resolution.
    const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8')) as {
      packages: Record<string, { dev?: boolean; optional?: boolean }>;
    };
    const runtimePackages: Record<string, unknown> = {};
    for (const [path, info] of Object.entries(lock.packages)) {
      if (
        !path.startsWith('node_modules/') ||
        info.dev ||
        info.optional ||
        !existsSync(join(ROOT, path))
      )
        continue;
      const localSource = join(fixture, 'runtime', path);
      mkdirSync(dirname(localSource), { recursive: true });
      cpSync(join(ROOT, path), localSource, { recursive: true, dereference: true });
      runtimePackages[path] = { ...info, resolved: `file:${localSource}`, integrity: undefined };
    }
    const dependency = `file:${join(fixture, pack.filename)}`;
    const original = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const consumerPackage = {
      name: 'local-exports-consumer',
      version: '1.0.0',
      private: true,
      type: 'module',
      dependencies: { gennady: dependency },
    };
    writeFileSync(join(consumer, 'package.json'), JSON.stringify(consumerPackage));
    writeFileSync(
      join(consumer, 'package-lock.json'),
      JSON.stringify({
        name: consumerPackage.name,
        version: consumerPackage.version,
        lockfileVersion: 3,
        packages: {
          '': consumerPackage,
          'node_modules/gennady': {
            version: original.version,
            resolved: dependency,
            dependencies: original.dependencies,
          },
          ...runtimePackages,
        },
      })
    );
    // Native dependency peer/build readiness is not this export-layout contract. Preserve the
    // installed lock closure without re-solving its existing tree-sitter optional peer mismatch.
    run(
      'npm',
      [
        'install',
        '--offline',
        '--ignore-scripts',
        '--legacy-peer-deps',
        '--install-links',
        '--no-audit',
        '--no-fund',
      ],
      consumer
    );
    const installed = (context.installed = join(consumer, 'node_modules/gennady'));
    context.manifest = JSON.parse(
      readFileSync(join(installed, 'package.json'), 'utf8')
    ) as PackageShape;
    assert.deepEqual(
      context.manifest,
      JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')),
      'installed manifest must be exact, never a dependency-stripped test package'
    );
    writeFileSync(
      join(consumer, 'cold-import-guard.mjs'),
      `
      import processes from 'node:child_process';
      import http from 'node:http'; import https from 'node:https';
      import net from 'node:net'; import tls from 'node:tls';
      import { syncBuiltinESMExports } from 'node:module';
      globalThis.runtimeEffects = [];
      for (const [owner, names] of [[processes, ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']], [http, ['request', 'get', 'createServer']], [https, ['request', 'get', 'createServer']], [net, ['connect', 'createConnection', 'createServer']], [tls, ['connect', 'createServer']]]) {
        for (const name of names) owner[name] = () => { globalThis.runtimeEffects.push(name); throw new Error('cold import side effect: ' + name); };
      }
      globalThis.fetch = () => { globalThis.runtimeEffects.push('fetch'); throw new Error('cold import fetch'); };
      syncBuiltinESMExports();
    `
    );
    for (const name of ['@types/node', 'undici-types']) {
      mkdirSync(dirname(join(consumer, 'node_modules', name)), { recursive: true });
      cpSync(join(ROOT, 'node_modules', name), join(consumer, 'node_modules', name), {
        recursive: true,
        dereference: true,
      });
    }
  });
  after(() => {
    if (context.fixture) rmSync(context.fixture, { recursive: true, force: true });
  });

  for (const [entry, names] of Object.entries(ENTRIES)) {
    it(`${entry} ships executable JS and a closed declaration graph`, () => {
      const { installed, files } = context;
      const { js, types } = targets(entry);
      assert.match(js, /^\.\/dist\/.*\.js$/);
      assert.match(types, /^\.\/dist\/.*\.d\.ts$/);
      assert.ok(files.has(js.slice(2)), `JS target missing from tarball: ${js}`);
      assert.ok(files.has(types.slice(2)), `type target missing from tarball: ${types}`);
      assertClosure(join(installed, types));
      assertClosure(join(installed, js), false);
      const target = context.manifest!.exports[entry];
      assert.ok(typeof target !== 'string');
      assert.equal(target.default, target.import);
    });
    it(`${entry} cold-imports the unchanged public runtime identity with plain Node`, () => {
      const { consumer } = context;
      const specifier = entry === '.' ? 'gennady' : `gennady/${entry.slice(2)}`;
      const output = run(
        process.execPath,
        [
          '--import',
          join(consumer, 'cold-import-guard.mjs'),
          '--input-type=module',
          '-e',
          `
        import assert from 'node:assert/strict';
        import * as api from ${JSON.stringify(specifier)};
        assert.deepEqual(Object.keys(api).sort(), ${JSON.stringify([...names].sort())});
        ${entry === '.' ? "assert.deepEqual(api.diff([], []), { added: [], removed: [], updated: [] }); const mon = api.createMonitor(); assert.ok(mon); assert.throws(() => { mon.register('x', { key: 'x', scan: async () => [] }); mon.register('x', { key: 'x', scan: async () => [] }); }, api.DuplicateProviderError);" : ''}
        ${entry === './providers/claude' ? "assert.equal(new api.ClaudeProvider().key, 'claude'); assert.deepEqual(api.parseClaudeArgs('claude --model example'), { model: 'example' });" : ''}
        ${entry === './providers/opencode' ? "assert.equal(new api.OpenCodeProvider().key, 'opencode'); assert.equal(api.parseModelJson('{\"id\":\"example\"}'), 'example');" : ''}
        ${entry === './stack' ? "assert.equal(api.parseDuration('2s'), 2000); assert.throws(() => api.selectPhase([{ plugin: 'custom', steps: [], phases: {}, sddKinds: {}, requirements: [], rules: [] }], 'missing'), error => error instanceof api.VerifyPlanError && error.code === 'VERIFY_PLAN_UNKNOWN_PHASE');" : ''}
        assert.deepEqual(globalThis.runtimeEffects, [], 'no cold-import process/network calls, even caught');
        console.log('identity-ok');
      `,
        ],
        consumer
      );
      assert.equal(
        output.trim(),
        'identity-ok',
        'cold import must not print or start CLI/provider activity'
      );
    });
  }

  it('main/types fallback agrees with the declared monitor root, not old helper facade', () => {
    const { manifest } = context;
    assert.ok(manifest);
    const root = targets('.');
    assert.equal(`./${manifest.main.replace(/^\.\//, '')}`, root.js);
    assert.equal(`./${manifest.types.replace(/^\.\//, '')}`, root.types);
  });

  it('rejects existing but unshipped or ancestor declaration targets', () => {
    const unshipped = join(context.installed, 'dist/unshipped.d.ts');
    const ancestor = join(context.fixture, 'ancestor.d.ts');
    writeFileSync(unshipped, 'export {};');
    writeFileSync(ancestor, 'export {};');
    assert.throws(() => assertClosure(unshipped), /not shipped in tarball/);
    assert.throws(() => assertClosure(ancestor), /package closure escaped/);
  });

  it('all four APIs type-check in an installed strict NodeNext consumer without source paths', () => {
    const { consumer, fixture } = context;
    writeFileSync(
      join(consumer, 'consumer.ts'),
      `
      import { createMonitor, diff, observe, DuplicateProviderError, type AgentProvider, type AgentSession, type ObserveOpts } from 'gennady';
      import { ClaudeProvider, parseClaudeArgs, type PsInfoEntry, type SessionJsonData } from 'gennady/providers/claude';
      import { OpenCodeProvider, parseModelJson } from 'gennady/providers/opencode';
      import { selectPhase, VerifyPlanError, type VerifyPreset, type PluginId } from 'gennady/stack';
      const provider: AgentProvider = new ClaudeProvider();
      const mon = createMonitor(); mon.register(provider.key, provider); mon.register('oc', new OpenCodeProvider());
      const sessions: AgentSession[] = []; diff(sessions, sessions);
      const options: ObserveOpts = { interval: 1 }; observe(mon, options);
      const plugin: PluginId = 'foreign-plugin';
      const preset: VerifyPreset = { plugin, steps: [], phases: { arbitrary: { include: [] } }, sddKinds: {}, requirements: [], rules: [] };
      selectPhase([preset], 'arbitrary');
      const ps: PsInfoEntry | undefined = undefined; const json: SessionJsonData | undefined = undefined;
      void [ps, json, parseClaudeArgs(''), parseModelJson(null), DuplicateProviderError, VerifyPlanError];
    `
    );
    writeFileSync(
      join(consumer, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          noEmit: true,
          skipLibCheck: false,
          types: ['node'],
        },
        include: ['consumer.ts'],
      })
    );
    run(
      process.execPath,
      [join(ROOT, 'node_modules/typescript/bin/tsc'), '-p', join(consumer, 'tsconfig.json')],
      consumer
    );
    assert.ok(!existsSync(join(consumer, 'node_modules/tsx')));
    assert.ok(!existsSync(join(fixture, 'node_modules')), 'no ancestor package resolution');
  });

  it('source CLI works from a foreign cwd without a dist prerequisite', () => {
    // This is a separate source-development contract, never the installed JS/type consumer port.
    rmSync(join(context.build, 'dist'), { recursive: true });
    assert.ok(!existsSync(join(context.build, 'dist')));
    const output = run(
      process.execPath,
      [
        '--import',
        join(ROOT, 'node_modules/tsx/dist/loader.mjs'),
        join(context.build, 'cli/gennady.ts'),
        '--help',
      ],
      context.consumer
    );
    assert.match(output, /gennady/i);
    assert.ok(!existsSync(join(context.build, 'dist')), 'source CLI cannot seed a build artifact');
  });
});
