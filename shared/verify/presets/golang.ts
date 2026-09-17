// @file: Go stack preset — adapts the literal golang plugin to the SDD phase ladder and receipts.
// @consumers: presets/node, full-profile-plan, phase-receipt, readiness
// @tasks: V-09

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { golangPlugin } from '../../../plugins/golang/golang-plugin.ts';
import { applyStackConfig, pluginConfigOf } from '../stack-config.ts';
import type { Gate, StackConfig } from '../verify.types.ts';
import type { StackPreset } from './node.ts';

const PHASE_GATES = ['fix', 'type-check', 'test'] as const;

function quoteToken(token: string): string {
  if (/^[A-Za-z0-9_.\-/:=]+$/.test(token)) return token;
  return `'${token.replace(/'/g, `'\\''`)}'`;
}

/**
 * @purpose Render one argv without allowing its tokens to be reinterpreted as shell syntax.
 * @param argv Exact command and arguments.
 * @returns Shell-safe command text for the phase ladder's existing command-string boundary.
 */
export function renderGoArgv(argv: readonly string[]): string {
  return argv.map(quoteToken).join(' ');
}

/**
 * @purpose Produce the literal configured golang plugin plan for a whole repo or exact phase files.
 * @param root Absolute repository root.
 * @param config Merged stack config.
 * @param [targets] Exact phase Target Files; empty means whole repository.
 * @returns Plugin-owned gates after the standard stack-config transform.
 */
export function golangPluginGates(
  root: string,
  config: StackConfig | null,
  targets: readonly string[] = []
): readonly Gate[] {
  const detection = golangPlugin.detect(root);
  if (!detection) return [];
  const scope = golangPlugin.verify.resolveScope(detection, {
    mode: targets.length > 0 ? 'files' : 'all',
    targets,
  });
  const planned = golangPlugin.verify.planGates(detection, scope, {
    pluginConfig: pluginConfigOf(config, 'golang'),
  });
  return applyStackConfig(
    planned,
    pluginConfigOf(config, 'golang'),
    'golang',
    root,
    new Map(),
    undefined,
    targets
  );
}

function phaseCommand(
  root: string,
  config: StackConfig | null,
  name: string,
  targets: readonly string[]
): string | null {
  const gates = golangPluginGates(root, config, targets);
  if (name === 'fix') {
    const fmt = gates.find((gate) => gate.id === 'fmt');
    const files = targets.filter((target) => target.endsWith('.go'));
    const binary = fmt?.argv[0];
    return binary && files.length > 0
      ? renderGoArgv([binary, '-w', ...files.map((target) => resolve(root, target))])
      : null;
  }
  if (name === 'type-check') {
    const commands = ['build', 'vet'].flatMap((id) => {
      const gate = gates.find((candidate) => candidate.id === id);
      return gate && gate.skipped === null ? [renderGoArgv(gate.argv)] : [];
    });
    return commands.length === 2 ? commands.join(' && ') : null;
  }
  if (name === 'test') {
    const gate = gates.find((candidate) => candidate.id === 'test');
    return gate && gate.skipped === null ? renderGoArgv(gate.argv) : null;
  }
  const gate = gates.find((candidate) => candidate.id === name);
  return gate && gate.skipped === null ? renderGoArgv(gate.argv) : null;
}

/**
 * @purpose Resolve the Go preset against the actual repository root.
 * @param root Absolute repository root used by detection, scopes, and commands.
 * @param [config] Merged stack configuration; absent means the literal plugin defaults.
 * @returns Go's phase ladder, full-profile gates, and receipt fingerprint source.
 */
export function resolveGolangPreset(root: string, config: StackConfig | null = null): StackPreset {
  return {
    stack: 'golang',
    gateNames: (profile) =>
      profile === 'setup' ? [] : profile === 'full' ? golangPlugin.gateIds : PHASE_GATES,
    requiredGateNames: (profile) =>
      profile === 'setup' ? [] : profile === 'full' ? ['build', 'vet', 'fmt', 'test'] : PHASE_GATES,
    commandForGate: (name, _scripts, targets) => phaseCommand(root, config, name, targets),
    fullGates: () => golangPluginGates(root, config),
    environmentStateSource: 'shared/verify/presets/golang.ts#golangVerificationEnvironmentState',
  };
}

function makeRecipes(contents: string): string {
  const wanted = new Set(['generate', 'build', 'vet', 'fmt', 'lint', 'test']);
  const lines = contents.split(/\r?\n/);
  const selected: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    const match = /^([A-Za-z0-9_.-]+)\s*:(.*)$/.exec(lines[index] ?? '');
    if (!match || !wanted.has(match[1] ?? '')) continue;
    selected.push(lines[index] ?? '');
    while (/^\t/.test(lines[index + 1] ?? '')) selected.push(lines[++index] ?? '');
  }
  return selected.join('\n');
}

/**
 * @purpose Fingerprint Go manifests and only preset-named Makefile recipes for phase receipts.
 * @param root Repository root.
 * @returns Stable sha256 state, or a fail-closed read diagnostic.
 */
export function golangVerificationEnvironmentState(
  root: string
): { ok: true; state: string } | { ok: false; issue: string } {
  try {
    const parts: string[] = [];
    for (const name of ['go.mod', 'go.sum', 'go.work', 'go.work.sum']) {
      const file = resolve(root, name);
      if (existsSync(file)) parts.push(name, readFileSync(file, 'utf-8'));
    }
    const makefile = resolve(root, 'Makefile');
    if (existsSync(makefile)) parts.push('Makefile', makeRecipes(readFileSync(makefile, 'utf-8')));
    if (!parts.includes('go.mod')) {
      return { ok: false, issue: "cannot fingerprint Go verification: 'go.mod' is missing" };
    }
    return {
      ok: true,
      state: `sha256:${createHash('sha256').update(parts.join('\0')).digest('hex')}`,
    };
  } catch (cause) {
    return {
      ok: false,
      issue: `cannot fingerprint Go verification environment: ${cause instanceof Error ? cause.message : String(cause)}`,
    };
  }
}
