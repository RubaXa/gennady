// @file: Fail-closed V1 tooling purge + fresh V2 migration runtime transaction.
// @spec: CLI-SDD-MIGRATE
// @consumers: sdd-migrate.cmd.ts

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalize,
  SYNC_PATH_RULES,
  SYNC_SKILLS_PATH_RULES,
} from '../common/sync/path-normalizer.ts';
import type {
  MigrationBootstrapAction,
  MigrationBootstrapResult,
} from './migration-bootstrap.types.ts';

const SKILLS_MANIFEST = '.claude/skills/.gennady-synced';

/**
 * Resolve migration assets from the package that is executing this command, never from an older
 * `gennady` dependency installed in the consumer being migrated.
 * @param subdir Package-relative asset directory.
 * @returns Absolute asset directory, or null when the executing package is incomplete.
 */
export function resolveBootstrapPackageDir(subdir: string): string | null {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth++) {
    try {
      const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8')) as {
        name?: string;
      };
      if (manifest.name === 'gennady') {
        const candidate = join(dir, subdir);
        return existsSync(candidate) ? candidate : null;
      }
    } catch {
      // Not the package root; keep walking toward the filesystem root.
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Hashes of the last package-owned V1 runtime immediately before the V2 cutover (`fa6fc8f^`).
 * Bytes are normalized exactly as sync/sync-skills normalized them before deployment. This is an
 * ownership proof, not a path heuristic: any other bytes block bootstrap before the first write.
 */
const KNOWN_V1_BYTES: Readonly<Record<string, string>> = {
  'ai/directives/sdd/README.md': 'aae305e170a29305aff30622fa46c0f0d47358fa69ad6ca1aef65466c6d4919b',
  'ai/directives/sdd/audit.directive.xml':
    '6c45e3e55af7fa5819abe8929201d304fc77994b7f669f539314c3d34be0efd6',
  'ai/directives/sdd/critic-protocol.xml':
    'd428310e374d8718dcafc2a2f91ce07dde553c81aa709fdc23a2bd2b1fff6507',
  'ai/directives/sdd/critic.directive.xml':
    '2a05f64ff5d8c62729daf7bb0a497ecbb80e1bf04546e0237bffcb68ace0c67d',
  'ai/directives/sdd/discovery.directive.xml':
    '8bdcb4ad04f821c8c725c24193357e5a9f26737c22b4bde388a56b3abdf94ee0',
  'ai/directives/sdd/fix.directive.xml':
    '105d6be6d971710d01f3534f266774581a819fbbd7e7e69da8000554c6f17e00',
  'ai/directives/sdd/module-decomposition.directive.xml':
    '2339b3068ccf0e15b1fbbd6cc989a1e118f569aa13c9d41db06283d85c56fc87',
  'ai/directives/sdd/phase-execution-protocol.xml':
    'ef32b63266c7621bab17e09efc561f0dfa08f4c69b0ea558af9721cf736f6816',
  'ai/directives/sdd/scaffold.directive.xml':
    '560dab37888190e7b04a1965b0f5e979a8c0f1acdc40ade11b3bb05139b51f29',
  'ai/directives/sdd/setup.directive.xml':
    'f843bb775f1f87c17405abc26192dbb42723b3d8a09c6176b5501c598c2db5a1',
  'ai/directives/sdd/svelte-ui-discovery.directive.xml':
    '722464a0a1af4be5baa912c159c401168f8bfadbffffc43706f0d47408ec01b6',
  '.claude/skills/agent-inbox/SKILL.md':
    '833466c360db12063f1d8c2bb68b3fccb8940f06800830c73792ff48c880081d',
  '.claude/skills/alt-opinion/SKILL.md':
    '335d3e756c58eff157b45be60bd40cd888562cb6d8e10a9e004808a7e37fca7f',
  '.claude/skills/alt-opinion/opinion.prompt.md':
    '14a56758d552295ade8d304acee67e307de31f99c16555e1bc75e86e53611011',
  '.claude/skills/alt-opinion/synth.prompt.md':
    '2fc9229e78e5e1eea0552e76fb2ce29d1b0cd2790c5f6cd79e4d7c0d0089f8cb',
  '.claude/skills/opencode-get-session/SKILL.md':
    'e064403662638e1bb79f60053440e53a4c8f9f336705ef1c8fb57be7dbb31940',
  '.claude/skills/prd-interview/PRD_TEMPLATE.md':
    'c1acc5d094347c34c6ae6aa39bf2bb06853f8a600b49411c279085cc7a925fc6',
  '.claude/skills/prd-interview/SKILL.md':
    '66cb84d142acc5d713c37d936e140da21d0e5e6f7b005bfa548f5fceae7fe8ac',
  '.claude/skills/sdd-audit/SKILL.md':
    '2138529cc699ee35af6734b4d8c4f98559a99f62e85a8cb6afe5e87c24fbfc0c',
  '.claude/skills/sdd-check/SKILL.md':
    '8dd8e17feaa91f2fa6a030c3ee5c49b267c87f74b8280a0be588d1512fadd256',
  '.claude/skills/sdd-code-review/SKILL.md':
    '5747b2c28ece028f52c34dc17c912259a5c8be9df945d9f912afc5d1e43aa93e',
  '.claude/skills/sdd-continue/SKILL.md':
    'a77848411d5ec3cef62b25aab86ba8ef50f75000443b3d7984fdcc664bb38604',
  '.claude/skills/sdd-critic/SKILL.md':
    '871873633c8702544df8fea009951b766d01b46b2ef19c3684e3b853851b6cc3',
  '.claude/skills/sdd-discover/SKILL.md':
    '89d00bf83066d130157c59a3e6936bc5d30845e967f5075a845eeb04a95ff949',
  '.claude/skills/sdd-execute-batch/SKILL.md':
    '74ca47371ac6a4b590f6902562e51a5c61e90672726c3c82a9cc2861d58d5356',
  '.claude/skills/sdd-execute/SKILL.md':
    '00ff63ef420626eddba7dc0dd38e9da49e9119a5dbae5e80d8b268b8890525e4',
  '.claude/skills/sdd-execute/scripts/README.md':
    '2def4be7328cae05e9dc5defb8954e58d0c37d8545c5e2c3b1b122821a3248f9',
  '.claude/skills/sdd-execute/scripts/_sdd-lib.sh':
    '70eee91178325c7ef99a2523aa0d553759044605dee4b29129d7c39706762394',
  '.claude/skills/sdd-execute/scripts/check-blockers.sh':
    'da54568c1fe968c20945668f7a94e6182886261abb7b176bf3bf0adc76a3622f',
  '.claude/skills/sdd-execute/scripts/check.sh':
    '375f58837a9c17b6972e7bc87cea88fb81933ea21c95d6da344688a0a66fcb59',
  '.claude/skills/sdd-execute/scripts/classify-scripts.js':
    '2c3d6cf9144a674847bdb3a884dc945fcaa28123e996eddf6e8f6884442685a7',
  '.claude/skills/sdd-execute/scripts/classify-scripts.ts':
    '57ef6ee58d04b9b25c6b47c6bd6fab5cfbd924165cba5c9501b6f0a9d8e8c415',
  '.claude/skills/sdd-execute/scripts/extract-section.sh':
    '2975a7d693ecb3d31fe53c66734053f5404a057a3e4b5f0cc22799f29aa13f53',
  '.claude/skills/sdd-execute/scripts/lint-artifacts.sh':
    'e4df1dc37f48da9f8ab2098ff4a85623d793d3cf3dfb7766b44caf6ae91f720f',
  '.claude/skills/sdd-execute/scripts/scan.sh':
    '2ae2a82ee2b8cb962d0f110e82097dfbbd33529929c9fac1e65cbfb1e0dda42c',
  '.claude/skills/sdd-execute/scripts/sdd':
    '13590858795eead2ecdc412015071ed73ecfdb3c4a6381c03f5afcfa50a51d3e',
  '.claude/skills/sdd-execute/scripts/verify.sh':
    '999f2491149e36de2a9a9b2940b9841c07abea1a90f04648de76e0d3a2b9f014',
  '.claude/skills/sdd-fix/SKILL.md':
    '62b14268d96320fddbf954402801348cc5db159094ba8350c8c3deca36f982c3',
  '.claude/skills/sdd-hooks-install/SKILL.md':
    'f2bb17adc5ba238d4a335733053cbf3cdbca4f05731a34b14701f44fcf9f795d',
  '.claude/skills/sdd-infra/SKILL.md':
    '2478e11d2491fb6571f21e9bbb7142e6a390eee5eb0a95ef8b073481143f1b1d',
  '.claude/skills/sdd-module-decomposition/SKILL.md':
    '66df6efd09c5c083c6d70007bbbac8962fa6e3716aadf61a2815fe7f0b45a801',
  '.claude/skills/sdd-reconcile/SKILL.md':
    '149d270eca1e4acad2840f0b4f9ef4067513f52ed9dbac9beba824462881b744',
  '.claude/skills/sdd-scaffold/SKILL.md':
    '8d50a2bbb8962dae8c2d1fc833e9474e31ac41f837aad1d86c2e6eac564b991c',
  '.claude/skills/sdd-setup/SKILL.md':
    '98346b13987b6f0645fc7fa77cc61d67b8a88f4b2d99e0e9b3cf2d3720967082',
  '.claude/skills/sdd/SKILL.md': '060b9f4a111166552f0b173fa2b1578202eaa8b50fb043ba75622bf22cdff408',
  '.claude/skills/workspace-permission-setup/SKILL.md':
    '7d98bbc8b8520d5ae42a71de0a47c3fbcccc65fa79a87657fa2b6d875db6ca65',
};

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function relativeUnix(root: string, path: string): string {
  return relative(root, path).split(sep).join('/');
}

function filesUnder(root: string): string[] {
  if (!existsSync(root)) return [];
  if (lstatSync(root).isSymbolicLink()) throw new Error(`symbolic link is not supported: ${root}`);
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error(`symbolic link is not supported: ${entry.name}`);
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile()) out.push(abs);
    }
  };
  walk(root);
  return out.sort();
}

function symlinkInPath(root: string, rel: string): string | null {
  let current = root;
  for (const part of rel.split('/')) {
    current = join(current, part);
    try {
      if (lstatSync(current).isSymbolicLink()) return relativeUnix(root, current);
    } catch {
      // An absent path ends the existing ancestor chain. `lstatSync` still catches dangling links.
      break;
    }
  }
  return null;
}

function sourceFiles(root: string, kind: 'directives' | 'skills'): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  for (const abs of filesUnder(root)) {
    const rel = relativeUnix(root, abs);
    const parts = rel.split('/');
    if (parts.some((part) => part.startsWith('.') || part === '__tests__')) continue;
    if (kind === 'skills' && parts.length < 2) continue;
    if (kind === 'skills' && /\.(test|spec)\.[cm]?[jt]sx?$/.test(parts.at(-1) ?? '')) continue;
    const target = kind === 'directives' ? `ai/directives/sdd-v2/${rel}` : `.claude/skills/${rel}`;
    const rules = kind === 'directives' ? SYNC_PATH_RULES : SYNC_SKILLS_PATH_RULES;
    out.set(target, Buffer.from(normalize(readFileSync(abs, 'utf-8'), rules), 'utf-8'));
  }
  return out;
}

function readManifest(root: string): {
  entries: Set<string>;
  raw: Buffer | null;
  errors: string[];
} {
  const path = join(root, SKILLS_MANIFEST);
  if (!existsSync(path)) return { entries: new Set(), raw: null, errors: [] };
  const raw = readFileSync(path);
  const entries = new Set<string>();
  const errors: string[] = [];
  for (const line of raw.toString('utf-8').split('\n')) {
    const entry = line.trim();
    if (!entry || entry.startsWith('#')) continue;
    if (entry.startsWith('/') || entry.split('/').includes('..')) {
      errors.push(`${SKILLS_MANIFEST}: небезопасная запись ownership «${entry}»`);
      continue;
    }
    entries.add(entry);
  }
  return { entries, raw, errors };
}

function manifestBody(entries: readonly string[]): Buffer {
  return Buffer.from(
    '# Skills and files owned by `gennady sync-skills` or `sdd-migrate bootstrap`.\n' +
      '# Only exact listed paths may be pruned by package tooling.\n' +
      `${[...entries].sort().join('\n')}\n`,
    'utf-8'
  );
}

/**
 * Build and optionally apply the V1-runtime purge + current V2-runtime installation transaction.
 * @param root Consumer repository root. `specs/**`, `tasks/**`, and project code are never targets.
 * @param packageDirectivesDir Installed package `ai/directives/sdd-v2` directory.
 * @param packageSkillsDir Installed package `ai/skills` directory.
 * @param write Whether to apply the preflighted transaction; false is a no-write dry-run.
 * @returns Deterministic actions or fail-closed diagnostics.
 */
export function bootstrapMigrationRuntime(
  root: string,
  packageDirectivesDir: string,
  packageSkillsDir: string,
  write: boolean
): MigrationBootstrapResult {
  let fresh: Map<string, Buffer>;
  try {
    fresh = new Map([
      ...sourceFiles(packageDirectivesDir, 'directives'),
      ...sourceFiles(packageSkillsDir, 'skills'),
    ]);
  } catch (cause) {
    return { ok: false, errors: [`package source unreadable: ${(cause as Error).message}`] };
  }
  const manifestSymlink = symlinkInPath(root, SKILLS_MANIFEST);
  if (manifestSymlink) {
    return {
      ok: false,
      errors: [`${manifestSymlink}: symlink внутри managed bootstrap path запрещён`],
    };
  }
  const manifest = readManifest(root);
  const errors = [...manifest.errors];
  const currentTargets = new Set(fresh.keys());
  const legacyCandidates = new Set<string>();
  const historicalSkillNames = new Set(
    Object.keys(KNOWN_V1_BYTES)
      .filter((rel) => rel.startsWith('.claude/skills/'))
      .map((rel) => rel.slice('.claude/skills/'.length).split('/')[0])
  );
  const currentSkillNames = new Set(
    [...fresh.keys()]
      .filter((rel) => rel.startsWith('.claude/skills/'))
      .map((rel) => rel.slice('.claude/skills/'.length).split('/')[0])
  );
  const manifestedSkillNames = new Set([...manifest.entries].map((entry) => entry.split('/')[0]));
  const inspectedSkillNames = new Set([
    ...historicalSkillNames,
    ...currentSkillNames,
    ...manifestedSkillNames,
  ]);

  for (const name of manifestedSkillNames) {
    if (!historicalSkillNames.has(name) && !currentSkillNames.has(name)) {
      errors.push(
        `${SKILLS_MANIFEST}: неизвестный package-owned skill «${name}»; версия V1 не поддерживается автоматическим hash proof`
      );
    }
  }

  for (const rel of [SKILLS_MANIFEST, ...fresh.keys(), 'ai/directives/sdd']) {
    const symlink = symlinkInPath(root, rel);
    if (symlink) errors.push(`${symlink}: symlink внутри managed bootstrap path запрещён`);
  }

  try {
    for (const abs of filesUnder(join(root, 'ai/directives/sdd'))) {
      legacyCandidates.add(relativeUnix(root, abs));
    }
    for (const abs of filesUnder(join(root, 'ai/directives/sdd-v2'))) {
      const rel = relativeUnix(root, abs);
      if (!fresh.has(rel)) errors.push(`${rel}: неизвестный файл внутри managed V2 directive root`);
    }
    for (const name of inspectedSkillNames) {
      const skillRoot = join(root, '.claude', 'skills', name);
      for (const abs of filesUnder(skillRoot)) legacyCandidates.add(relativeUnix(root, abs));
    }
  } catch (cause) {
    errors.push((cause as Error).message);
  }

  for (const rel of [...legacyCandidates].sort()) {
    const abs = join(root, rel);
    const current = fresh.get(rel);
    const actual = readFileSync(abs);
    if (current && sha256(actual) === sha256(current)) continue;
    const known = KNOWN_V1_BYTES[rel];
    if (!known || sha256(actual) !== known) {
      errors.push(
        `${rel}: неизвестные или изменённые bytes; bootstrap не имеет права удалить/заменить файл`
      );
    }
  }

  for (const [rel, expected] of fresh) {
    const abs = join(root, rel);
    if (!existsSync(abs)) continue;
    const actual = readFileSync(abs);
    if (sha256(actual) === sha256(expected)) continue;
    if (KNOWN_V1_BYTES[rel] && sha256(actual) === KNOWN_V1_BYTES[rel]) continue;
    errors.push(
      `${rel}: существующий runtime не совпадает ни с доказанным V1, ни с текущим V2 package source`
    );
  }

  if (errors.length > 0) return { ok: false, errors: [...new Set(errors)].sort() };

  const actions: MigrationBootstrapAction[] = [];
  for (const rel of [...legacyCandidates].sort()) {
    if (!currentTargets.has(rel)) actions.push({ kind: 'delete', path: rel });
  }
  for (const [rel, bytes] of [...fresh.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0
  )) {
    const abs = join(root, rel);
    if (!existsSync(abs) || sha256(readFileSync(abs)) !== sha256(bytes))
      actions.push({ kind: 'write', path: rel });
  }

  const currentSkillEntries = [...fresh.keys()]
    .filter((rel) => rel.startsWith('.claude/skills/'))
    .map((rel) => rel.slice('.claude/skills/'.length));
  const currentSkillNameList = currentSkillEntries.map((entry) => entry.split('/')[0]);
  const managedSkillNames = new Set([...historicalSkillNames, ...currentSkillNames]);
  const retained = [...manifest.entries].filter(
    (entry) => !managedSkillNames.has(entry.split('/')[0])
  );
  const nextManifest = manifestBody([
    ...new Set([...retained, ...currentSkillNameList, ...currentSkillEntries]),
  ]);
  if (manifest.raw === null || sha256(manifest.raw) !== sha256(nextManifest)) {
    actions.push({ kind: 'write', path: SKILLS_MANIFEST });
  }
  if (existsSync(join(root, 'ai/directives/sdd'))) {
    actions.push({ kind: 'delete-dir', path: 'ai/directives/sdd' });
  }
  for (const name of historicalSkillNames) {
    if (currentSkillNames.has(name)) continue;
    const rel = `.claude/skills/${name}`;
    if (existsSync(join(root, rel))) actions.push({ kind: 'delete-dir', path: rel });
  }
  const rank = { delete: 0, write: 1, 'delete-dir': 2 } as const;
  actions.sort(
    (a, b) => rank[a.kind] - rank[b.kind] || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  );
  if (!write) return { ok: true, actions };

  const touched = [...new Set(actions.map((action) => action.path))];
  const before = new Map<string, Buffer | 'directory' | null>();
  for (const rel of touched) {
    const abs = join(root, rel);
    before.set(
      rel,
      !existsSync(abs) ? null : lstatSync(abs).isDirectory() ? 'directory' : readFileSync(abs)
    );
  }
  try {
    for (const action of actions) {
      const abs = join(root, action.path);
      if (action.kind === 'delete') {
        rmSync(abs, { force: true });
      } else if (action.kind === 'delete-dir') {
        rmSync(abs, { recursive: true, force: true });
      } else {
        const bytes = action.path === SKILLS_MANIFEST ? nextManifest : fresh.get(action.path);
        if (!bytes) throw new Error(`missing staged bytes for ${action.path}`);
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, bytes);
      }
    }
  } catch (cause) {
    for (const rel of touched.reverse()) {
      const abs = join(root, rel);
      const bytes = before.get(rel);
      if (bytes === null) rmSync(abs, { force: true });
      else if (bytes === 'directory') mkdirSync(abs, { recursive: true });
      else if (bytes) {
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, bytes);
      }
    }
    return {
      ok: false,
      errors: [`bootstrap transaction rolled back: ${(cause as Error).message}`],
    };
  }
  return { ok: true, actions };
}
