// @file: Regression guard keeping dispatchable SDD CLI commands discoverable in every navigation surface.
// @consumers: CLI maintainers
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
const ENTRYPOINT = join(ROOT, 'cli', 'gennady.ts');
const CLI_AGENTS = join(ROOT, 'cli', 'AGENTS.md');
const CMD_README = join(ROOT, 'cli', 'cmd', 'README.md');
const GLOBAL_HELP = join(ROOT, 'cli', 'cmd', 'help', 'help.cmd.ts');

const EXPECTED = [
  'sdd-check',
  'sdd-extract',
  'sdd-log',
  'sdd-migrate',
  'sdd-new',
  'sdd-orient',
  'sdd-state',
  'sdd-sync',
  'sdd-task',
  'sdd-verify',
] as const;

function sortedMatches(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(pattern)].map((match) => match[1] as string).sort();
}

describe('dispatchable SDD command navigation', () => {
  const entrypoint = readFileSync(ENTRYPOINT, 'utf-8');
  const helpStart = entrypoint.indexOf('#region START_PER_COMMAND_HELP');
  const helpEnd = entrypoint.indexOf('#endregion END_PER_COMMAND_HELP');
  const dispatchStart = entrypoint.indexOf('switch (command)', helpEnd);
  const helpSwitch = entrypoint.slice(helpStart, helpEnd);
  const dispatchSwitch = entrypoint.slice(dispatchStart);
  const expected = [...EXPECTED].sort();

  it('extracts the same exact 10-command set from help and dispatch switches', () => {
    assert.ok(helpStart >= 0 && helpEnd > helpStart && dispatchStart > helpEnd);
    const helpCases = sortedMatches(helpSwitch, /case '(sdd-[a-z-]+)':/g);
    const dispatchCases = sortedMatches(dispatchSwitch, /case '(sdd-[a-z-]+)':/g);
    assert.strictEqual(new Set(helpCases).size, helpCases.length, 'duplicate SDD help case');
    assert.strictEqual(
      new Set(dispatchCases).size,
      dispatchCases.length,
      'duplicate SDD dispatch case'
    );
    assert.deepStrictEqual(helpCases, expected);
    assert.deepStrictEqual(dispatchCases, expected);
  });

  it('lists that exact set in cli/AGENTS, cmd/README, and global help', () => {
    const agents = readFileSync(CLI_AGENTS, 'utf-8');
    const readme = readFileSync(CMD_README, 'utf-8');
    const globalHelp = readFileSync(GLOBAL_HELP, 'utf-8');
    assert.deepStrictEqual(sortedMatches(agents, /^\|\s*(sdd-[a-z-]+)\s*\|/gm), expected);
    assert.deepStrictEqual(sortedMatches(readme, /^\|\s*`(sdd-[a-z-]+)`\s*\|/gm), expected);
    assert.deepStrictEqual(sortedMatches(globalHelp, /['"]\s{2}(sdd-[a-z-]+)\s/g), expected);
  });

  it('has a real help module for every command and links only specs that exist', () => {
    for (const command of EXPECTED) {
      assert.ok(
        existsSync(join(ROOT, 'cli', 'cmd', command, 'help.ts')),
        `${command} help missing`
      );
    }
    const readme = readFileSync(CMD_README, 'utf-8');
    for (const command of EXPECTED) {
      const spec = `specs/cli/${command}/${command}.spec.md`;
      if (existsSync(join(ROOT, spec))) {
        assert.ok(readme.includes(`\`${spec}\``), `existing spec is not linked: ${spec}`);
      }
    }
    for (const match of readme.matchAll(/`(specs\/cli\/sdd-[^`]+\.spec\.md)`/g)) {
      assert.ok(existsSync(join(ROOT, match[1] as string)), `linked spec missing: ${match[1]}`);
    }
  });

  it('does not advertise the phantom sdd scan command', () => {
    const surfaces = [
      entrypoint,
      readFileSync(CLI_AGENTS, 'utf-8'),
      readFileSync(CMD_README, 'utf-8'),
      readFileSync(GLOBAL_HELP, 'utf-8'),
    ].join('\n');
    assert.doesNotMatch(surfaces, /\bsdd(?:\s+|-)scan\b/i);
  });
});
