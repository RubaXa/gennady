// @file: D-64 assembled full profile — one primary preset plus non-blocking extra-stack tails.
// @consumers: sdd-verify/index.ts, verify/verify.cmd.ts
// @tasks: V-13b

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { applyStackConfig, pluginConfigOf } from '../../../shared/verify/stack-config.ts';
import {
  detectRepoStack,
  primaryStackOf,
  type RepoStackDetection,
} from '../../../shared/verify/stack-detection.ts';
import { resolvePreset } from '../../../shared/verify/presets/node.ts';
import type { StackConfig, StackId } from '../../../shared/verify/verify.types.ts';
import { GATES, type Gate } from './sdd-verify.types.ts';

/** @purpose One executable gate in the shared D-64 full-profile plan. */
export type AssembledFullProfileGate = Gate & {
  /** @purpose Detected stack that owns this gate. */
  readonly stack: StackId;
  /** @purpose Exact rendered command, or null when no runnable command exists. */
  readonly command: string | null;
  /** @purpose Whether a missing command invalidates the primary profile. */
  readonly required: boolean;
  /** @purpose Whether this gate belongs to the blocking primary stack. */
  readonly primary: boolean;
};

/** @purpose Shared D-64 model consumed by full execution and read-only JSON planning. */
export type AssembledFullProfile = {
  /** @purpose Canonical ordered repository stack detection. */
  readonly detection: RepoStackDetection;
  /** @purpose First detected stack after D-64 ordering. */
  readonly primary: StackId;
  /** @purpose Primary gates followed by qualified secondary gates. */
  readonly gates: readonly AssembledFullProfileGate[];
};

function readScripts(root: string): Record<string, string> {
  try {
    const parsed = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8')) as {
      scripts?: Record<string, string>;
    };
    return parsed.scripts ?? {};
  } catch {
    return {};
  }
}

function quoteToken(token: string): string {
  if (/^[A-Za-z0-9_.\-/:=]+$/.test(token)) return token;
  return `'${token.replace(/'/g, `'\\''`)}'`;
}

function gennadyCommand(root: string, name: string): { argv: readonly string[]; text: string } {
  let selfHosting = false;
  try {
    const parsed = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8')) as {
      name?: string;
    };
    selfHosting = parsed.name === 'gennady';
  } catch {
    // A markerless bootstrap repository is a consumer, never self-hosting by path inference.
  }
  const argv = selfHosting
    ? ['npx', '--no-install', 'tsx', 'cli/gennady.ts', name]
    : ['npx', '--no-install', 'gennady', name];
  return { argv, text: argv.map(quoteToken).join(' ') };
}

function assembleStackGates(
  root: string,
  config: StackConfig | null,
  stack: StackId,
  primary: boolean,
  scripts: Readonly<Record<string, string>>
): AssembledFullProfileGate[] {
  const configuredExtras = applyStackConfig(
    [],
    pluginConfigOf(config, stack),
    stack,
    root,
    new Map()
  );
  const preset = resolvePreset(stack, 'full', root, config);
  if (preset === null) {
    if (primary) {
      throw new Error(
        `SDD_VERIFY_PRESET_UNAVAILABLE: detected primary stack "${stack}" has no full-profile preset`
      );
    }
    return configuredExtras.map((gate) => ({
      name: `${stack}:${gate.id}`,
      stack,
      command: gate.argv.map(quoteToken).join(' '),
      argv: gate.argv,
      cwd: gate.cwd,
      env: gate.env,
      timeoutMs: gate.timeoutMs,
      envFail: gate.envFail,
      requires: gate.requires,
      outputMeansFailure: gate.outputMeansFailure,
      driftMeansFailure: gate.driftMeansFailure,
      mutates: false,
      haltsOnFailure: false,
      required: false,
      primary: false,
      tail: true,
      nonBlocking: true,
    }));
  }
  const required = new Set(preset.requiredGateNames('full', false));
  const presetNames = preset.gateNames('full', false);
  const names = [
    ...presetNames,
    ...configuredExtras.map((gate) => gate.id).filter((name) => !presetNames.includes(name)),
  ];
  return names.map((name) => {
    const configured = configuredExtras.find((gate) => gate.id === name);
    const builtin = configured ? undefined : GATES.find((gate) => gate.name === name);
    const native = builtin?.via === 'gennady' ? gennadyCommand(root, name) : null;
    const argv = native?.argv ?? configured?.argv;
    const command =
      native?.text ??
      (argv ? argv.map(quoteToken).join(' ') : preset.commandForGate(name, scripts, []));
    const scriptName = /^npm run (\S+)$/.exec(command ?? '')?.[1];
    return {
      ...(builtin ?? {
        name,
        mutates: false,
        haltsOnFailure: true,
      }),
      name: primary ? name : `${stack}:${name}`,
      stack,
      command,
      ...(configured
        ? {
            cwd: configured.cwd,
            env: configured.env,
            timeoutMs: configured.timeoutMs,
            envFail: configured.envFail,
            requires: configured.requires,
            outputMeansFailure: configured.outputMeansFailure,
            driftMeansFailure: configured.driftMeansFailure,
          }
        : {}),
      required: primary && required.has(name),
      primary,
      tail: !primary || builtin === undefined || !builtin.haltsOnFailure,
      nonBlocking: !primary,
      ...(argv && argv.length > 0 ? { argv } : {}),
      ...(scriptName ? { scriptName } : {}),
      ...(name === 'test:coverage' ? { coverageProducer: true } : {}),
    };
  });
}

/**
 * @purpose Build the shared D-64 full-profile model for execution and JSON planning.
 * @invariant Primary gates precede stable, qualified, non-blocking gates from every secondary stack.
 * @param root Absolute repository root.
 * @param config Valid merged stack configuration, or null.
 * @returns Ordered detected stacks and their assembled full-profile gates.
 */
export function resolveAssembledFullProfile(
  root: string,
  config: StackConfig | null
): AssembledFullProfile {
  const detection = detectRepoStack(root, config);
  const primary = primaryStackOf(detection);
  const scripts = readScripts(root);
  const gates = detection.stacks.flatMap((stack) =>
    assembleStackGates(root, config, stack, stack === primary, scripts)
  );
  return { detection, primary, gates };
}
