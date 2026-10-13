// @file: UV-29 deterministic selected Swift tool/readiness, failure and public safety acceptance.
// @spec: CLI-VERIFY
// @consumers: normal unit gate; independent Swift prototype review

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { it } from 'node:test';
import { resolveSwiftVerifyPlan } from '../swift-planner.ts';
import { runVerifyCommand } from '../../../cli/cmd/verify/verify.cmd.ts';
import { safeVerifyText } from '../../../shared/verify/reporting/report-safety.ts';
import { runWithSddAttemptJournal } from '../../../shared/sdd/verify/sdd-attempt-journal.ts';

const GIT = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
const VERSIONS: Record<string, string> = {
  swift: 'Swift version 6.0',
  swiftformat: '0.55.5',
  swiftlint: '0.57.0',
  xcodebuild: 'Xcode 16.2\nBuild version 16C5032a',
  tuist: '4.202.0',
  xcrun: 'Xcode 16.2',
};
type ToolBehavior = {
  version?: string;
  broken?: boolean;
  delay?: boolean;
  versionWrite?: boolean;
  versionRefWrite?: boolean;
  background?: boolean;
  developerVersion?: boolean;
  splitStreams?: boolean;
  splitChunks?: boolean;
  output?: string;
  exit?: number;
};

function write(root: string, relative: string, value: string): void {
  fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  fs.writeFileSync(path.join(root, relative), value);
}

async function fixture(
  run: (root: string, home: string, bin: string, top: string) => void | Promise<void>,
  options: {
    kind?: 'package' | 'xcode';
    tool?: string;
    behavior?: ToolBehavior;
    args?: string[];
    env?: Record<string, string>;
    custom?: boolean;
    step?: string;
  } = {}
): Promise<void> {
  const top = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'uv29-owned-')));
  const root = path.join(top, 'repo');
  const home = path.join(top, 'home');
  const bin = path.join(top, 'bin');
  const previousPath = process.env.PATH;
  try {
    fs.mkdirSync(root);
    fs.mkdirSync(home);
    fs.mkdirSync(bin);
    write(
      root,
      options.kind === 'package' ? 'Package.swift' : 'App.xcworkspace/contents.xcworkspacedata',
      '// owned marker\n'
    );
    write(root, 'Sources/App.swift', 'print("owned")\n');
    fs.symlinkSync(GIT, path.join(bin, 'git'));
    write(
      bin,
      'which',
      '#!/bin/sh\ncandidate="${0%/*}/$1"\n[ -x "$candidate" ] && printf "%s\\n" "$candidate"\n'
    );
    fs.chmodSync(path.join(bin, 'which'), 0o755);
    for (const [tool, version] of Object.entries(VERSIONS)) {
      const behavior = tool === (options.tool ?? 'xcodebuild') ? (options.behavior ?? {}) : {};
      write(
        bin,
        tool,
        [
          `#!${process.execPath}`,
          `const fs=require('node:fs');const argv=process.argv.slice(2);let groupOwned=false;try{process.kill(-process.pid,0);groupOwned=true}catch{}`,
          `fs.appendFileSync(${JSON.stringify(path.join(top, 'calls.log'))},JSON.stringify({tool:${JSON.stringify(tool)},argv,groupOwned,developer:process.env.DEVELOPER_DIR})+'\\n');`,
          `if(argv.includes('--version')||argv.includes('-version')||argv[0]==='version'){`,
          behavior.versionWrite
            ? `fs.writeFileSync(${JSON.stringify(path.join(root, 'Sources/App.swift'))},'unexpected version write');`
            : '',
          behavior.versionRefWrite
            ? `require('node:child_process').execFileSync(${JSON.stringify(GIT)},['-C',${JSON.stringify(root)},'update-ref','refs/heads/owned-probe-drift','HEAD']);`
            : '',
          behavior.background
            ? `const child=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(`setTimeout(()=>{require('node:fs').writeFileSync(${JSON.stringify(path.join(root, 'Sources/App.swift'))},'late unexpected version write')},11000)`)}],{stdio:'ignore'});fs.appendFileSync(${JSON.stringify(path.join(top, 'child-pids.log'))},String(child.pid)+'\\n');`
            : '',
          behavior.delay
            ? 'setTimeout(()=>{},15000);'
            : `process.stdout.write(${behavior.developerVersion ? `process.env.DEVELOPER_DIR==='owned-bad'?'Xcode 15.4':${JSON.stringify(behavior.version ?? version)}` : JSON.stringify(behavior.version ?? version)});process.exit(${behavior.broken ? 1 : 0});`,
          `}else{const done=()=>process.exit(${behavior.exit ?? 0});const afterOutput=()=>{${behavior.splitStreams ? `process.stderr.write(${JSON.stringify(behavior.output ?? '')},done);` : 'done();'}};${behavior.splitChunks ? `process.stdout.write(${JSON.stringify((behavior.output ?? '').slice(0, 10))});process.stdout.write(${JSON.stringify((behavior.output ?? '').slice(10))},afterOutput);` : `process.stdout.write(${JSON.stringify(behavior.output ?? '')},afterOutput);`}}`,
          '',
        ].join('\n')
      );
      fs.chmodSync(path.join(bin, tool), 0o755);
    }
    if (options.custom !== false) {
      const tool = options.tool ?? 'xcodebuild';
      const argv = [
        tool === 'true' ? '/usr/bin/true' : path.join(bin, tool),
        ...(options.args ?? [
          '-workspace',
          'App.xcworkspace',
          '-scheme',
          'App',
          '-destination',
          'platform=iOS Simulator,name=Owned',
          'build',
        ]),
      ];
      write(
        root,
        'gennady.yaml',
        JSON.stringify({
          verify: {
            presets: {
              swift: {
                steps: {
                  [options.step ?? 'operation']: {
                    tags: ['selected'],
                    needs: [],
                    ...(options.step ? {} : { executor: 'local', effect: 'observe' }),
                    command: { argv, cwd: '.', ...(options.env ? { env: options.env } : {}) },
                    requires: [],
                    timeout: '30s',
                    onFailure: 'stop-phase',
                  },
                },
                phases: { check: { include: ['selected'] } },
              },
            },
          },
        })
      );
    }
    execFileSync(GIT, ['init', '-q', '-b', 'main'], { cwd: root });
    execFileSync(GIT, ['add', '.'], { cwd: root });
    execFileSync(
      GIT,
      [
        '-c',
        'user.name=Owned Fixture',
        '-c',
        'user.email=owned@example.invalid',
        'commit',
        '-qm',
        'owned fixture',
      ],
      { cwd: root }
    );
    process.env.PATH = bin;
    await run(fs.realpathSync(root), home, bin, top);
  } finally {
    const childPids = path.join(top, 'child-pids.log');
    if (fs.existsSync(childPids))
      for (const pid of fs.readFileSync(childPids, 'utf8').trim().split('\n')) {
        try {
          process.kill(Number(pid), 'SIGKILL');
        } catch {
          /* Owned timed-out descendants normally already died. */
        }
      }
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    fs.rmSync(top, { recursive: true, force: true });
  }
}

function planned(root: string, home: string, phase = 'check') {
  return resolveSwiftVerifyPlan(root, phase, {
    homeDirectory: home,
    targetFiles: ['Sources/App.swift'],
  });
}
const identity = [
  '-workspace',
  'App.xcworkspace',
  '-scheme',
  'App',
  '-destination',
  'platform=iOS Simulator,name=Owned',
];

for (const version of ['Xcode 16.1', 'Xcode 15.4', 'not a version']) {
  it(`blocks actual selected Xcode command with ${version}`, () =>
    fixture(
      (root, home) => {
        const result = planned(root, home);
        assert.equal(result.readiness.status, 'BLOCKED');
        assert.ok(
          result.readiness.entries.some((e) => e.status === 'BLOCKED' && /16\.2/.test(e.fix ?? ''))
        );
      },
      { behavior: { version } }
    ));
}
for (const failure of ['missing', 'broken', 'timeout'] as const) {
  it(`blocks selected Xcode ${failure} probe with actionable hints`, () =>
    fixture(
      (root, home, bin) => {
        if (failure === 'missing') fs.rmSync(path.join(bin, 'xcodebuild'));
        const result = planned(root, home);
        assert.equal(result.readiness.status, 'BLOCKED');
        assert.ok(
          result.readiness.entries.some(
            (e) => e.status === 'BLOCKED' && /install|select|retry/i.test(e.fix ?? '')
          )
        );
      },
      { behavior: { broken: failure === 'broken', delay: failure === 'timeout' } }
    ));
}
for (const args of [
  ['build'],
  ['-workspace', 'App.xcworkspace', 'build'],
  [...identity, '-project', 'Other.xcodeproj', 'build'],
  [...identity, 'test'],
]) {
  it(`blocks incomplete actual Xcode identity/testPlan ${JSON.stringify(args)}`, () =>
    fixture(
      (root, home) => {
        assert.equal(planned(root, home).readiness.status, 'BLOCKED');
      },
      { args }
    ));
}
it('requires testPlan for actual integration/coverage test actions, not selector/step names', () =>
  fixture((root, home) => {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'gennady.yaml'), 'utf8'));
    config.verify.presets.swift.steps.operation.command.argv = [
      ...config.verify.presets.swift.steps.operation.command.argv.slice(0, 1),
      ...identity,
      'test-without-building',
      '-enableCodeCoverage',
      'YES',
    ];
    write(root, 'gennady.yaml', JSON.stringify(config));
    assert.equal(planned(root, home).readiness.status, 'BLOCKED');
    config.verify.presets.swift.steps.operation.command.argv.push('-testPlan', 'Owned');
    write(root, 'gennady.yaml', JSON.stringify(config));
    assert.equal(planned(root, home).readiness.status, 'READY');
  }));
it('accepts selected Xcode build without testPlan and probes only versions, not the gate', () =>
  fixture(async (root, home, _bin, top) => {
    const result = await runVerifyCommand(
      root,
      { phase: 'check', planOnly: true, format: 'json' },
      { homeDirectory: home }
    );
    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(result.report?.readiness.status, 'READY');
    const calls = fs.existsSync(path.join(top, 'calls.log'))
      ? fs
          .readFileSync(path.join(top, 'calls.log'), 'utf8')
          .trim()
          .split('\n')
          .map((l) => JSON.parse(l))
      : [];
    assert.ok(calls.length > 0);
    assert.ok(calls.every((c) => c.tool === 'xcodebuild' && c.argv.join(' ') === '-version'));
    assert.equal(result.report?.results.length, 0);
  }));
for (const version of ['4.201.9', 'not a version']) {
  it(`blocks actual Tuist command with ${version}`, () =>
    fixture(
      (root, home) => {
        const result = planned(root, home);
        assert.equal(result.readiness.status, 'BLOCKED');
        assert.ok(result.readiness.entries.some((e) => /4\.202\.0/.test(e.fix ?? '')));
      },
      { tool: 'tuist', args: ['generate'], behavior: { version } }
    ));
}
it('does not require Tuist merely because a Tuist marker exists', () =>
  fixture((root, home, bin) => {
    write(root, 'Project.swift', '// owned Tuist marker');
    fs.rmSync(path.join(bin, 'tuist'));
    assert.equal(planned(root, home).readiness.status, 'READY');
  }));
it('SwiftPM and generic custom commands do not demand unrelated Apple tools', () =>
  fixture(
    (root, home, bin, top) => {
      fs.rmSync(path.join(bin, 'xcodebuild'));
      fs.rmSync(path.join(bin, 'tuist'));
      assert.equal(planned(root, home).readiness.status, 'READY');
      assert.ok(!fs.existsSync(path.join(top, 'calls.log')));
    },
    { kind: 'package', tool: 'true', args: [] }
  ));
it('remote-only slice probes no local tools despite missing Xcode/Tuist', () =>
  fixture((root, home, bin, top) => {
    for (const name of Object.keys(VERSIONS)) fs.rmSync(path.join(bin, name));
    const result = planned(root, home, 'ci');
    assert.ok(!result.readiness.entries.some((e) => /xcode-identity|tool:/.test(e.requirementId)));
    assert.ok(!fs.existsSync(path.join(top, 'calls.log')));
  }));
it('guards a version shim unexpected write and restores dirty bytes instead of reporting ready', () =>
  fixture(
    (root, home) => {
      write(root, 'Sources/App.swift', 'preexisting dirty bytes');
      const before = fs.readFileSync(path.join(root, 'Sources/App.swift'));
      const index = execFileSync(GIT, ['ls-files', '--stage'], { cwd: root });
      const result = planned(root, home);
      assert.equal(result.readiness.status, 'BLOCKED');
      assert.deepEqual(fs.readFileSync(path.join(root, 'Sources/App.swift')), before);
      assert.deepEqual(execFileSync(GIT, ['ls-files', '--stage'], { cwd: root }), index);
    },
    { behavior: { versionWrite: true } }
  ));
for (const [output, exit, verdict] of [
  ['ordinary lint findings', 1, 'fail'],
  ['compiler error: unknown symbol', 65, 'fail'],
  ['unknown tool failure', 127, 'fail'],
  ['dyld: Library not loaded: missing-library', 127, 'env-fail'],
] as const) {
  it(`classifies selected SwiftLint ${output} as ${verdict}`, () =>
    fixture(
      async (root, home) => {
        const result = await runVerifyCommand(
          root,
          { phase: 'check', planOnly: false, format: 'json' },
          { homeDirectory: home }
        );
        assert.equal(result.report?.verdict, verdict, result.stderr);
      },
      { step: 'lint', tool: 'swiftlint', args: ['lint', '--strict'], behavior: { output, exit } }
    ));
}
it('sanitizes common quoted/JSON/token/URL and known-env secret forms through one helper', () => {
  const env = { TUIST_TOKEN: 'owned-known-value' };
  const input =
    '{"TUIST_TOKEN":"owned quoted value"} password="owned spaced password" Authorization: Basic owned-basic https://user:owned-url@host/path ghp_ownedOpaqueToken123456 owned-known-value';
  const actual = safeVerifyText(input, '/owned/root', env);
  for (const secret of [
    'owned quoted value',
    'owned spaced password',
    'owned-basic',
    'owned-url',
    'ownedOpaqueToken123456',
    'owned-known-value',
  ])
    assert.ok(!actual.includes(secret), actual);
  assert.match(actual, /redacted/);
});
it('keeps raw failure classification but sanitizes output/public JSON/text and persisted SDD journal', () =>
  fixture(
    async (root, home) => {
      const ticket = path.join(root, 'specs/task.md');
      write(
        root,
        'specs/task.md',
        '# Owned task\n<!--SECTION:PHASES_OVERVIEW-->\n| ID | Kind | Deps | Status |\n|---|---|---|---|\n| P1 | code | — | [ ] |\n<!--/SECTION:PHASES_OVERVIEW-->\n<!--SECTION:PHASE_P1-->\n### P1\n- **Target Files:**\n  - Sources/App.swift\n- **Deleted Files:**\n  - none\n<!--/SECTION:PHASE_P1-->\n<!--SECTION:EXECUTION_LOG-->\n<!--/SECTION:EXECUTION_LOG-->\n'
      );
      const outcome = await runWithSddAttemptJournal({
        root,
        ticketPath: ticket,
        sddPhase: 'P1',
        run: () =>
          runVerifyCommand(
            root,
            { phase: 'check', planOnly: false, format: 'json' },
            { homeDirectory: home }
          ),
      });
      assert.equal(outcome.report?.verdict, 'fail');
      assert.ok(!outcome.stdout.includes('owned-secret-output'));
      assert.ok(!JSON.stringify(outcome.report?.results).includes('owned-secret-output'));
      assert.ok(!JSON.stringify(outcome.report?.evidence).includes('owned-secret-output'));
      assert.ok(!fs.readFileSync(ticket, 'utf8').includes('owned-secret-output'));
      const text = await runVerifyCommand(
        root,
        { phase: 'check', planOnly: false, format: 'text' },
        { homeDirectory: home }
      );
      assert.ok(!text.stdout.includes('owned-secret-output'));
    },
    {
      tool: 'swiftlint',
      args: ['lint'],
      env: { TUIST_TOKEN: 'owned-secret-output' },
      behavior: { output: 'unknown failure owned-secret-output', exit: 1 },
    }
  ));
it('sanitizes malformed configuration public error without changing its exit code', () =>
  fixture(async (root, home) => {
    write(root, 'gennady.yaml', 'verify:\n  forbidden-owned-secret-output: true\n');
    const previous = process.env.TUIST_TOKEN;
    process.env.TUIST_TOKEN = 'owned-secret-output';
    try {
      const result = await runVerifyCommand(
        root,
        { phase: 'check', planOnly: true, format: 'json' },
        { homeDirectory: home }
      );
      assert.equal(result.exitCode, 4);
      assert.ok(!result.stderr.includes('owned-secret-output'));
    } finally {
      if (previous === undefined) delete process.env.TUIST_TOKEN;
      else process.env.TUIST_TOKEN = previous;
    }
  }));
it('blocks low Xcode through actual xcrun selectors before any build/test spawn', () =>
  fixture(
    async (root, home, _bin, top) => {
      const result = await runVerifyCommand(
        root,
        { phase: 'check', planOnly: false, format: 'json' },
        { homeDirectory: home }
      );
      assert.equal(result.report?.verdict, 'blocked', result.stderr);
      assert.equal(result.exitCode, 1);
      const calls = fs
        .readFileSync(path.join(top, 'calls.log'), 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      assert.ok(
        calls.every(
          (call) =>
            call.argv.join(' ') ===
              '--sdk iphonesimulator --toolchain XcodeDefault xcodebuild -version' &&
            call.groupOwned
        )
      );
    },
    {
      tool: 'xcrun',
      args: [
        '--sdk',
        'iphonesimulator',
        '--toolchain',
        'XcodeDefault',
        'xcodebuild',
        ...identity,
        'build',
      ],
      behavior: { version: 'Xcode 16.1' },
    }
  ));

it('xcrun --find and xccov export do not fabricate build/test identity requirements', () =>
  fixture(
    (root, home, _bin, top) => {
      assert.equal(planned(root, home).readiness.status, 'READY');
      assert.ok(!fs.existsSync(path.join(top, 'calls.log')));
      const config = JSON.parse(fs.readFileSync(path.join(root, 'gennady.yaml'), 'utf8'));
      config.verify.presets.swift.steps.operation.command.argv = [
        config.verify.presets.swift.steps.operation.command.argv[0],
        '--sdk',
        'iphonesimulator',
        'xccov',
        'view',
        '--report',
        '--json',
        'Owned.xcresult',
      ];
      write(root, 'gennady.yaml', JSON.stringify(config));
      const result = planned(root, home);
      assert.equal(result.readiness.status, 'READY');
      assert.ok(
        !result.readiness.entries.some((entry) => entry.requirementId.includes('xcode-identity'))
      );
    },
    { tool: 'xcrun', args: ['--find', 'xcodebuild'] }
  ));

it('a scheme named test is not a test action and needs no testPlan', () =>
  fixture(
    (root, home) => {
      assert.equal(planned(root, home).readiness.status, 'READY');
    },
    {
      args: [
        '-workspace',
        'App.xcworkspace',
        '-scheme',
        'test',
        '-destination',
        'platform=iOS Simulator,name=Owned',
        'build',
      ],
    }
  ));

for (const args of [
  ['-version'],
  ['-showsdks'],
  ['-list', '-workspace', 'App.xcworkspace'],
  [...identity, '-testPlan', 'test', 'build'],
]) {
  it(`Xcode discovery/build option values are mode-aware: ${JSON.stringify(args)}`, () =>
    fixture(
      (root, home) => {
        const result = planned(root, home);
        assert.equal(result.readiness.status, 'READY');
        if (args[0]?.startsWith('-') && ['-version', '-showsdks', '-list'].includes(args[0]))
          assert.ok(
            !result.readiness.entries.some((entry) =>
              entry.requirementId.includes('xcode-identity')
            )
          );
      },
      { args }
    ));
}

it('SwiftPM actual selected swift build probes no unrelated Apple tools', () =>
  fixture(
    (root, home, bin) => {
      for (const tool of ['xcodebuild', 'tuist', 'xcrun']) fs.rmSync(path.join(bin, tool));
      assert.equal(planned(root, home).readiness.status, 'READY');
    },
    { kind: 'package', tool: 'swift', args: ['build'] }
  ));

it('missing selected formatter is BLOCKED with pinned install hint', () =>
  fixture(
    (root, home, bin) => {
      fs.rmSync(path.join(bin, 'swiftformat'));
      const result = planned(root, home);
      assert.equal(result.readiness.status, 'BLOCKED');
      assert.ok(
        result.readiness.entries.some((entry) => /project-pinned swiftformat/.test(entry.fix ?? ''))
      );
    },
    { kind: 'package', tool: 'swiftformat', args: ['--lint', 'Sources/App.swift'] }
  ));

it('missing Git protection never runs a selected version executable', () =>
  fixture((root, home, _bin, top) => {
    fs.rmSync(path.join(root, '.git'), { recursive: true });
    assert.equal(planned(root, home).readiness.status, 'BLOCKED');
    assert.ok(!fs.existsSync(path.join(top, 'calls.log')));
  }));

it('actual bounded output removes a partial known command-env secret at truncation', () =>
  fixture(
    async (root, home) => {
      const result = await runVerifyCommand(
        root,
        { phase: 'check', planOnly: false, format: 'json' },
        { homeDirectory: home }
      );
      assert.equal(result.report?.verdict, 'fail');
      assert.match(result.report?.results[0]?.output ?? '', /truncated/);
      assert.ok(!(result.report?.results[0]?.output ?? '').includes('owned-partial'));
      assert.ok(!result.stdout.includes('owned-partial'));
    },
    {
      tool: 'swiftlint',
      args: ['lint'],
      env: { TUIST_TOKEN: 'owned-partial-secret-with-long-tail' },
      behavior: {
        output: ' '.repeat(65_490) + 'owned-partial-secret-with-long-tail'.repeat(5),
        exit: 1,
      },
    }
  ));

for (const [version, status] of [
  ['4.202.0-rc.1', 'BLOCKED'],
  ['4.202.0+owned', 'READY'],
  ['4.203.0-rc.1', 'READY'],
] as const) {
  it(`Tuist ${version} uses a truthful stable-floor comparison`, () =>
    fixture(
      (root, home) => {
        assert.equal(planned(root, home).readiness.status, status);
      },
      { tool: 'tuist', args: ['generate'], behavior: { version } }
    ));
}

it('probes the selected executable/env and does not cache a different DEVELOPER_DIR', () =>
  fixture(
    (root, home, _bin, top) => {
      const config = JSON.parse(fs.readFileSync(path.join(root, 'gennady.yaml'), 'utf8'));
      config.verify.presets.swift.steps.other = structuredClone(
        config.verify.presets.swift.steps.operation
      );
      config.verify.presets.swift.steps.other.command.env = { DEVELOPER_DIR: 'owned-bad' };
      write(root, 'gennady.yaml', JSON.stringify(config));
      assert.equal(planned(root, home).readiness.status, 'BLOCKED');
      const calls = fs
        .readFileSync(path.join(top, 'calls.log'), 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      assert.equal(calls.filter((call) => call.tool === 'xcodebuild').length, 2);
      assert.ok(calls.some((call) => call.developer === 'owned-bad'));
    },
    { behavior: { developerVersion: true } }
  ));

it('timed-out version descendants cannot write after the protection boundary releases', () =>
  fixture(
    async (root, home) => {
      const before = fs.readFileSync(path.join(root, 'Sources/App.swift'));
      assert.equal(planned(root, home).readiness.status, 'BLOCKED');
      await new Promise((resolve) => setTimeout(resolve, 1500));
      assert.deepEqual(fs.readFileSync(path.join(root, 'Sources/App.swift')), before);
    },
    { behavior: { delay: true, background: true } }
  ));

it('ref-mutating version shim is blocked with checkpoint retained, never automatic ref rollback', () =>
  fixture(
    (root, home) => {
      const result = planned(root, home);
      assert.equal(result.readiness.status, 'BLOCKED');
      assert.ok(result.readiness.entries.some((entry) => /checkpoint/.test(entry.message)));
      assert.ok(fs.existsSync(path.join(root, '.git/gennady-workspace-guard.lock')));
      assert.match(
        execFileSync(GIT, ['rev-parse', 'refs/heads/owned-probe-drift'], {
          cwd: root,
          encoding: 'utf8',
        }),
        /^[a-f\d]{40}/
      );
    },
    { behavior: { versionRefWrite: true } }
  ));

it('sanitizer handles lone surrogates/root-containing secrets and bounded partial credentials', () => {
  const secret = '/owned/root/credential';
  assert.ok(!safeVerifyText(secret, '/owned/root', { TUIST_TOKEN: secret }).includes('credential'));
  assert.doesNotThrow(() => safeVerifyText('\\ud800', '/owned', { TUIST_TOKEN: '\ud800' }));
  assert.ok(
    !safeVerifyText('owned-secret-pre\n[truncated 80 byte(s)]', '/owned', {
      TUIST_TOKEN: 'owned-secret-prefix-full',
    }).includes('owned-secret-pre')
  );
  assert.ok(
    !safeVerifyText('password="owned truncated\n[truncated 80 byte(s)]', '/owned').includes(
      'owned truncated'
    )
  );
});

it('stdout/stderr/chunked credentials are sanitized while structured identities stay intact', () =>
  fixture(
    async (root, home) => {
      const previous = process.env.TUIST_TOKEN;
      process.env.TUIST_TOKEN = 'local';
      try {
        const result = await runVerifyCommand(
          root,
          { phase: 'check', planOnly: false, format: 'json' },
          { homeDirectory: home }
        );
        assert.equal(result.report?.verdict, 'fail');
        assert.ok(!result.stdout.includes('owned-stream-secret'));
        const projection = JSON.parse(result.stdout);
        assert.ok(
          projection.evidence.some(
            (item: { identity: string; kind: string }) =>
              item.kind === 'command' && item.identity.startsWith('local:swift:operation:command:')
          )
        );
        assert.match(projection.results[0].process.commandIdentity, /^sha256:[a-f\d]{64}$/);
      } finally {
        if (previous === undefined) delete process.env.TUIST_TOKEN;
        else process.env.TUIST_TOKEN = previous;
      }
    },
    {
      tool: 'swiftlint',
      args: ['lint'],
      behavior: {
        output: '{"TUIST_TOKEN":"owned-stream-secret"}',
        splitChunks: true,
        splitStreams: true,
        exit: 1,
      },
    }
  ));
