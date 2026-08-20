// @file: E2E tests for sync-skills — installed-tarball scenarios plus the cloned/linked shape.
// @consumers: E2eContext
// @tasks: TSK-60

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { getContext } from './setup.ts';

function cleanupSkillsDir(): void {
  const { cwd } = getContext();
  try {
    rmSync(join(cwd, '.claude', 'skills'), { recursive: true, force: true });
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'EACCES' || e.code === 'EBUSY') {
      process.stderr.write(`sync-skills afterEach cleanup warning: ${e.message}\n`);
      return;
    }
    throw err;
  }
}

export function registerSyncSkillsTests(): void {
  describe('sync-skills', () => {
    describe('install and repeat', () => {
      it('should install skills on first run', async () => {
        const { spawn } = getContext();
        const result = await spawn(['sync-skills']);
        assert.strictEqual(result.exitCode, 0);
        assert.match(result.stdout, /added/);
      });

      it('should report unchanged on repeat run', async () => {
        const { spawn } = getContext();
        const result = await spawn(['sync-skills']);
        assert.strictEqual(result.exitCode, 0);
        assert.match(result.stdout, /unchanged/);
      });
    });

    describe('other scenarios', () => {
      // #region START_SYNC_SKILLS_CLEANUP — invariant: remove .claude/skills/ after each test; EACCES/EBUSY logged but not fatal
      afterEach(cleanupSkillsDir);
      // #endregion END_SYNC_SKILLS_CLEANUP

      it('should support --dry-run', async () => {
        const { spawn } = getContext();
        const result = await spawn(['sync-skills', '--dry-run']);
        assert.strictEqual(result.exitCode, 0);
        assert.match(result.stdout, /Dry-run: no files written/);
      });

      it('should filter by skill name', async () => {
        const { spawn } = getContext();
        const result = await spawn(['sync-skills', 'sdd-execute']);
        assert.strictEqual(result.exitCode, 0);
      });
    });

    describe('plugin-owned skills', () => {
      afterEach(cleanupSkillsDir);

      it('installs a skill a plugin owns, with a consumer-facing directive path', async () => {
        const { spawn, cwd } = getContext();
        const result = await spawn(['sync-skills']);
        assert.strictEqual(result.exitCode, 0);

        const skill = join(cwd, '.claude', 'skills', 'sdd-infra-golang', 'SKILL.md');
        assert.ok(existsSync(skill), 'the golang plugin owns this skill and it must still ship');

        const text = readFileSync(skill, 'utf-8');
        assert.match(
          text,
          /ai\/directives\/infra\/golang-setup\.xml/,
          'consumers read the directive under ai/, which is where `gennady sync` puts it'
        );
        assert.doesNotMatch(text, /plugins\/golang\/directives/, 'source-only path must not ship');
        assert.doesNotMatch(text, /~\/Developer\/gennady/, 'dev-machine paths must not ship');
      });
    });
  });
}

/** Repository root of this checkout — the shape a cloned or `npm link`-ed install runs from. */
const CHECKOUT_ROOT = resolve(import.meta.dirname, '../../..');

/**
 * @purpose Run this checkout's CLI against a throwaway consumer with no node_modules/gennady.
 * @param args CLI arguments.
 * @param cwd Consumer directory.
 * @returns Captured stdout.
 */
function runFromCheckout(args: readonly string[], cwd: string): string {
  return execFileSync(
    join(CHECKOUT_ROOT, 'node_modules', '.bin', 'tsx'),
    [join(CHECKOUT_ROOT, 'cli', 'gennady.ts'), ...args],
    { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
}

/**
 * @purpose Register the cloned/linked-install cases the packed-tarball suite cannot reach.
 * @sideEffect Registers node:test suites; spawns the CLI and writes temp consumer directories.
 */
export function registerSyncSkillsCheckoutTests(): void {
  describe('sync-skills from a cloned or linked install', () => {
    let consumer = '';

    afterEach(() => {
      if (consumer.length > 0) {
        rmSync(consumer, { recursive: true, force: true });
        consumer = '';
      }
    });

    it('resolves the package from a checkout that has no node_modules/gennady', () => {
      consumer = mkdtempSync(join(tmpdir(), 'gennady-linked-'));
      writeFileSync(join(consumer, 'package.json'), '{ "name": "c", "private": true }\n');

      // A published install resolves through dist/; a checkout resolves to a source file, and
      // deriving the package root by stripping `dist` only ever worked for the first.
      const out = runFromCheckout(['sync-skills', '--dry-run'], consumer);
      assert.doesNotMatch(out, /package not found/);
      assert.match(out, /sdd-infra-golang/, 'a plugin-owned skill must be found under plugins/');
    });

    it('an empty leftover directory does not shadow a plugin-owned skill', () => {
      consumer = mkdtempSync(join(tmpdir(), 'gennady-linked-'));
      writeFileSync(join(consumer, 'package.json'), '{ "name": "c", "private": true }\n');

      // The silent failure this came from: a stale empty ai/skills/<name>/ left by a half-cleaned
      // publish staging won the source merge and removed the skill from every sync.
      const leftover = join(CHECKOUT_ROOT, 'ai', 'skills', 'sdd-infra-golang');
      const preexisting = existsSync(leftover);
      mkdirSync(leftover, { recursive: true });
      try {
        // A real sync, not a dry run: with the shadowing bug the skill name still appeared in the
        // listing while no file was ever written, so only the written file proves it.
        runFromCheckout(['sync-skills'], consumer);
        assert.ok(
          existsSync(join(consumer, '.claude', 'skills', 'sdd-infra-golang', 'SKILL.md')),
          'an empty directory must never shadow the plugin that really owns the skill'
        );
      } finally {
        if (!preexisting) {
          rmSync(leftover, { recursive: true, force: true });
        }
      }
    });
  });
}
