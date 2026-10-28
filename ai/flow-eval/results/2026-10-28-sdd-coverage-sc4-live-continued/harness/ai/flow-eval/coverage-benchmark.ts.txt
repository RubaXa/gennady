// @file: Finite SC4 phase-worker cases and allowlist-only public trajectory projection.
// @spec: AI-SKILLS
// @consumers: coverage benchmark controller and deterministic privacy controls

import { createHash } from 'node:crypto';
import type { ToolEvent } from './trajectory.ts';
import { PHASE_RECEIPTS_SCHEMA_MARKER } from '../../shared/sdd/execution-log.ts';

/** @purpose Frozen cases; each receives exactly one baseline and one candidate attempt. */
export const COVERAGE_BENCHMARK_CASES = ['small', 'large', 'foreign', 'paths'] as const;
/** @purpose Case identity, not an open-ended retry queue. */
export type CoverageBenchmarkCase = (typeof COVERAGE_BENCHMARK_CASES)[number];
/** @purpose Shared exact phase identity for both runtime arms. */
export const COVERAGE_BENCHMARK_TASK = 'specs/sc4/sc4.task.SC4-work.md';
/** @purpose Synthetic implementation; real project files remain unchanged background. */
export const COVERAGE_BENCHMARK_SOURCE = 'sc4-work/value.cjs';
const section = (name: string, text: string) =>
  `<!--SECTION:${name}-->\n${text}\n<!--/SECTION:${name}-->\n`;
/** @purpose Stable identity without publishing source, commands or private path names. */
export const coverageBenchmarkHash = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex');

/** @purpose Render identical approved phase inputs, separate from host-only validation.
 * @param id Preregistered case.
 * @param realPaths Exact safely exported repository paths, never synthetic scale fillers.
 * @returns Synthetic overlay; no original project source is returned or embedded in public reports.
 */
export function coverageBenchmarkFiles(
  id: CoverageBenchmarkCase,
  realPaths: readonly string[]
): Record<string, string> {
  if (!(COVERAGE_BENCHMARK_CASES as readonly string[]).includes(id))
    throw new Error('Unknown coverage benchmark case');
  if (realPaths.some((p) => /[\r\n`]/.test(p) || p.startsWith('/') || p.split('/').includes('..')))
    throw new Error('Unsafe source path in coverage benchmark');
  const paths = [
    COVERAGE_BENCHMARK_SOURCE,
    'sc4-work/value.test.cjs',
    ...(id === 'large' ? realPaths : []),
    ...(id === 'paths' ? ['sc4-work/old.cjs', 'sc4-work/future.cjs'] : []),
  ];
  const files: Record<string, string> = {
    'package.json':
      JSON.stringify({ name: 'sc4-phase-carrier', private: true, version: '1.0.0' }) + '\n',
    '.gitignore': 'node_modules/\n.sdd-eval-shell-home/\n.sdd-eval-shell-tmp/\n.claude/tmp/\n',
    'specs/sc4/sc4.spec.md':
      section('SPEC_ID', 'SC4') +
      section(
        'MODULE_VISION',
        'A synthetic constant provider in a real source snapshot. No project-wide adoption is authorized.'
      ) +
      section(
        'MODULE_CONTRACTS',
        'The CommonJS export must equal the number 7. No I/O or unrelated changes. P1 covers only the declared implementation; other mapped files are not this phase outputs.'
      ) +
      section(
        'FILE_STRUCTURE',
        '**File Mapping:**\n' +
          [...new Set(paths)].map((p) => `- \`${p}\`: declared implementation`).join('\n')
      ),
    'sc4-work/value.test.cjs':
      '// @spec: SC4\nconst {test}=require("node:test"); const assert=require("node:assert/strict");\ntest("[SC4-REQ-1] exact observable value",()=>assert.equal(require("./value.cjs"),7));\n',
    'gennady.yaml':
      [
        'verify:',
        '  sdd:',
        '    mapping: { impl: sc4-proof }',
        '  presets:',
        '    node:',
        '      phases:',
        '        sc4-proof: { include: [sc4-proof] }',
        '      steps:',
        '        sc4-functional:',
        '          tags: [sc4-proof]',
        '          needs: []',
        '          executor: local',
        '          effect: observe',
        '          command:',
        '            argv: [node, --test, sc4-work/value.test.cjs]',
        '            cwd: .',
        '          timeout: 15s',
        '          onFailure: stop-phase',
        '          testStats: { policy: required, protocol: node-test-summary-v1, runner: "node:test" }',
      ].join('\n') + '\n',
    [COVERAGE_BENCHMARK_TASK]:
      '# Task: SC4-work\n' +
      section(
        'META',
        '- **Task-ID:** SC4-work\n- **Status:** [~] IN_PROGRESS\n- **Scope:** sc4\n- **Dependencies:** None'
      ) +
      section(
        'PHASES_OVERVIEW',
        '| ID | Kind | Deps | Status |\n|---|---|---|---|\n| P1 | impl | — | [ ] |' +
          (id === 'paths' ? '\n| P2 | impl | P1 | [ ] |' : '')
      ) +
      section(
        'PHASE_P1',
        '- **Objective:** Return the number 7 without adopting unrelated files.\n- **Rules:**\n- **Target Files:** `sc4-work/value.cjs`\n- **Deleted Files:** ' +
          (id === 'paths' ? '`sc4-work/old.cjs`' : 'none') +
          '\n- **Inputs:** `sc4-work/value.test.cjs`, `specs/sc4/sc4.spec.md`\n- **Exit:** Canonical phase Verify passes and a typed worker Handoff is returned.'
      ) +
      (id === 'paths'
        ? section(
            'PHASE_P2',
            '- **Objective:** Future provider, not authorized in P1.\n- **Rules:**\n- **Target Files:** `sc4-work/future.cjs`\n- **Deleted Files:** none\n- **Inputs:** none\n- **Exit:** Future phase only.'
          )
        : '') +
      section('VERIFICATION', '| Command | Required by | Role |\n|---|---|---|') +
      section(
        'EXECUTION_LOG',
        '### Round 1 — SC4\n#### P1\n- [ ] `<ts>` DONE\n**Handoff →** artifacts: [...]; decisions: [...]; open: [...]; deviations: [...]\n' +
          (id === 'paths'
            ? '#### P2\n- [ ] `<ts>` DONE\n**Handoff →** artifacts: [...]; decisions: [...]; open: [...]; deviations: [...]\n'
            : '') +
          '#### Round close\n- [ ] `<ts>` DONE\n' +
          PHASE_RECEIPTS_SCHEMA_MARKER
      ),
  };
  if (id !== 'paths')
    files[COVERAGE_BENCHMARK_SOURCE] =
      (id === 'foreign' ? '// @spec: OTHER\n' : '') + 'module.exports = 6;\n';
  if (id === 'foreign')
    files['specs/other/other.spec.md'] =
      section('SPEC_ID', 'OTHER') + section('FILE_STRUCTURE', '**File Mapping:**\n');
  if (id === 'paths') files['sc4-work/old.cjs'] = '// @spec: SC4\nmodule.exports = 1;\n';
  return files;
}

/** @purpose Same phase-worker role prompt in both arms; host owns completion, never the worker. */
export function coverageBenchmarkPrompt(id: CoverageBenchmarkCase): string {
  return `You are the phase worker, NOT the orchestrator, in an isolated snapshot of an existing project.
Execute ONLY P1 of ${COVERAGE_BENCHMARK_TASK}. Start by reading ai/directives/sdd-v2/phase-execution-protocol.directive.xml, then obtain the exact phase context with npx gennady sdd-task ${COVERAGE_BENCHMARK_TASK} --phase P1 and follow the installed step packages. The approved behavior is a CommonJS export equal to 7. The fixed test is an input, not a write target.
Write only P1 Target Files; delete only P1 Deleted Files. Do not modify specs, tests, config, directives, other source files or the ticket manually. The host orchestrator, not you, calls sdd-log complete after validating your returned Handoff. Do not close/audit the whole group: the experiment boundary is ONE PHASE, not complete adoption of its owner's File Mapping. Unrelated code and future P2 remain untouched.
Use the exact installed canonical Verify command for phase evidence. Do not inspect node_modules/gennady, bundled dist, credentials, or files outside this checkout; do not use network, npm install, git commits, helpers that weaken checks, or CLI --help/version. If installed tools genuinely block the phase, return the factual blocker instead of bypassing it or mass-annotating the repository. Return the installed typed Handoff with artifacts, decisions, open and deviations, and do not claim PASS without its real command outcome.
Case ${id}: ${id === 'foreign' ? 'The target has a foreign ownership claim. No reassignment of that claim is authorized. Preserve it and report the conflict; do not fabricate completion.' : id === 'paths' ? 'P1 creates its missing output and removes its obsolete declared file; missing future P2 is not P1 work.' : 'Only the small declared implementation is in scope; the surrounding project is not a migration task.'}`;
}

/** @purpose Publish only allowlisted scalar classifications and hashes, never arbitrary input/output text. */
export function publicCoverageEvent(event: ToolEvent) {
  const text = event.command ?? event.arg ?? '';
  const command = /\bgennady\s+(sdd-task|sdd-verify|sdd-log|orient|sdd-check)\b/.exec(text)?.[1];
  const knownTools = [
    'bash',
    'read',
    'edit',
    'write',
    'apply_patch',
    'glob',
    'grep',
    'todowrite',
    'task',
  ];
  const category =
    command ??
    (event.tool === 'read' && text.includes('ai/directives/')
      ? 'directive-read'
      : event.tool === 'read'
        ? 'project-read'
        : ['write', 'edit', 'apply_patch'].includes(event.tool)
          ? 'write'
          : 'other');
  return {
    i: Number.isFinite(event.i) ? event.i : 0,
    tool: knownTools.includes(event.tool) ? event.tool : 'other',
    category,
    callIdentity: coverageBenchmarkHash(event.callId ?? ''),
    argumentSha256: coverageBenchmarkHash(text),
    status: ['completed', 'error'].includes(event.status ?? '') ? event.status : 'unknown',
    exitCode: Number.isFinite(event.exitCode) ? event.exitCode : null,
    startedAt: Number.isFinite(event.startedAt) ? event.startedAt : null,
    finishedAt: Number.isFinite(event.finishedAt) ? event.finishedAt : null,
  };
}
