// @file: Swift preset tests — phase mapping, config ownership, and D-SWIFT-ENV fingerprinting.
// @consumers: CI
// @tasks: V-11

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import type { StackConfig } from '../../verify.types.ts';
import {
  resolveSwiftPreset,
  swiftPluginGates,
  swiftVerificationEnvironmentState,
} from '../swift.ts';

const roots: string[] = [];

/** @purpose Create a root plus deterministic fake Swift tools, isolated from the host toolchain. */
function fixture(
  files: Readonly<Record<string, string>>,
  run: (root: string, bin: string) => void
): void {
  const top = fs.mkdtempSync(path.join(os.tmpdir(), 'swift-preset-'));
  roots.push(top);
  const root = path.join(top, 'repo');
  const bin = path.join(top, 'bin');
  fs.mkdirSync(root);
  fs.mkdirSync(bin);
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  for (const [name, output] of [
    ['swift', 'Swift version 6.0'],
    ['swiftformat', 'swiftformat 1.0'],
    ['swiftlint', 'swiftlint 1.0'],
    ['xcodebuild', 'Xcode 26.0'],
  ] as const) {
    const executable = path.join(bin, name);
    fs.writeFileSync(executable, `#!/bin/sh\nprintf '%s\\n' '${output}'\n`);
    fs.chmodSync(executable, 0o755);
  }
  const previous = process.env['PATH'];
  process.env['PATH'] = `${bin}:/usr/bin:/bin`;
  try {
    run(root, bin);
  } finally {
    process.env['PATH'] = previous;
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('Swift preset V-11', () => {
  it('maps phase duties to format fixer/build/test and exposes the literal full profile', () => {
    fixture(
      {
        'Package.swift': '// swift-tools-version: 6.0\n',
        'Sources/App.swift': 'print("hello")\n',
      },
      (root) => {
        const preset = resolveSwiftPreset(root);

        assert.deepEqual(preset.gateNames('code', false), ['fix', 'type-check', 'test']);
        assert.deepEqual(preset.gateNames('full', false), ['format', 'build', 'test', 'lint']);
        assert.match(preset.commandForGate('fix', {}, ['Sources/App.swift']) ?? '', /swiftformat/);
        assert.match(preset.commandForGate('type-check', {}, []) ?? '', /swift build$/);
        assert.match(preset.commandForGate('test', {}, []) ?? '', /swift test$/);
        assert.deepEqual(preset.requiredGateNames('full', false), ['format', 'build', 'test']);
      }
    );
  });

  it('makes Xcode build/test runnable only through config-owned overrides', () => {
    fixture({ 'App.xcodeproj/project.pbxproj': '// project\n' }, (root) => {
      const absent = swiftPluginGates(root, null);
      assert.match(absent.find((gate) => gate.id === 'build')?.skipped ?? '', /project-owned/);

      const config: StackConfig = {
        use: ['swift'],
        swift: {
          overrideGates: {
            build: { argv: ['project-tool', 'build', '--scheme', 'App'] },
            test: { argv: ['project-tool', 'test', '--scheme', 'App'] },
          },
        },
      };
      const gates = swiftPluginGates(root, config);

      assert.deepEqual(gates.find((gate) => gate.id === 'build')?.argv, [
        'project-tool',
        'build',
        '--scheme',
        'App',
      ]);
      assert.equal(gates.find((gate) => gate.id === 'build')?.skipped, null);
      assert.equal(gates.find((gate) => gate.id === 'test')?.skipped, null);
    });
  });

  it('preserves a config-owned cwd and environment in the phase command', () => {
    fixture({ 'App.xcodeproj/project.pbxproj': '// project\n' }, (root) => {
      fs.mkdirSync(path.join(root, 'ios'));
      const preset = resolveSwiftPreset(root, {
        use: ['swift'],
        swift: {
          overrideGates: {
            build: {
              argv: ['project-tool', 'build'],
              cwd: 'ios',
              env: { CONFIGURATION: 'Debug Local' },
            },
          },
        },
      });

      assert.equal(
        preset.commandForGate('type-check', {}, []),
        "cd ios && env 'CONFIGURATION=Debug Local' project-tool build"
      );
    });
  });

  it('fingerprints manifests and tool versions, but not Swift sources or gate argv', () => {
    fixture(
      {
        'Package.swift': '// swift-tools-version: 6.0\n',
        'Package.resolved': '{}\n',
        'Sources/App.swift': 'print("one")\n',
      },
      (root) => {
        const before = swiftVerificationEnvironmentState(root);
        fs.writeFileSync(path.join(root, 'Sources/App.swift'), 'print("two")\n');
        assert.deepEqual(swiftVerificationEnvironmentState(root), before);

        fs.writeFileSync(path.join(root, 'Package.resolved'), '{"changed":true}\n');
        assert.notDeepEqual(swiftVerificationEnvironmentState(root), before);
      }
    );
  });

  it('fails closed when xcodebuild cannot provide the required environment version', () => {
    fixture({ 'Package.swift': '// swift-tools-version: 6.0\n' }, (root, bin) => {
      fs.writeFileSync(path.join(bin, 'xcodebuild'), '#!/bin/sh\nexit 72\n');
      fs.chmodSync(path.join(bin, 'xcodebuild'), 0o755);

      const result = swiftVerificationEnvironmentState(root);

      assert.equal(result.ok, false);
      if (!result.ok) assert.match(result.issue, /xcodebuild -version.*failed/);
    });
  });
});
