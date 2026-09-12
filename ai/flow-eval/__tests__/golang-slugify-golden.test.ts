// @file: Both-outcomes proof for the golang-slugify `task` golden gate (E-11, D-46 track 50) — the
//   Go analogue of infra-golden.test.ts. Requires `go` on PATH (the golden script itself shells out
//   to `go vet`/`go test`); every other flow-eval test stays fake-backed and Go-free.
// @consumers: ai/flow-eval/provision (golang-slugify fixture)
// @tasks: N/A

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { FIXTURE_FILES } from '../provision.ts';

const REFERENCE_SLUGIFY = `package slugify

import (
	"errors"
	"strings"
)

func Slugify(value string) (string, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", errors.New("slugify: value must not be empty")
	}
	lower := strings.ToLower(trimmed)
	var b strings.Builder
	prevHyphen := false
	for _, r := range lower {
		isWord := (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9')
		if isWord {
			b.WriteRune(r)
			prevHyphen = false
			continue
		}
		if !prevHyphen && b.Len() > 0 {
			b.WriteByte('-')
			prevHyphen = true
		}
	}
	out := strings.TrimRight(b.String(), "-")
	if out == "" {
		return "", errors.New("slugify: value must not be empty")
	}
	return out, nil
}
`;

// Intentionally wrong: identity function, never errors — must be REJECTED by the golden gate.
const BROKEN_SLUGIFY = `package slugify

func Slugify(value string) (string, error) {
	return value, nil
}
`;

function goAvailable(): boolean {
  return spawnSync('go', ['version'], { encoding: 'utf8' }).status === 0;
}

function layout(): string {
  const dir = mkdtempSync(join(tmpdir(), 'golang-slugify-golden-'));
  for (const [rel, content] of Object.entries(FIXTURE_FILES['golang-slugify'])) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

function install(dir: string, body: string): void {
  writeFileSync(join(dir, 'slugify.go'), body);
}

function verify(dir: string): { code: number; out: string } {
  const res = spawnSync('bash', [join(dir, 'golden', 'verify.sh')], { encoding: 'utf8' });
  return { code: res.status ?? 1, out: `${res.stdout ?? ''}${res.stderr ?? ''}` };
}

describe('golang-slugify golden gate (both outcomes reproducible, E-11)', () => {
  let skip = false;

  before(() => {
    skip = !goAvailable();
    if (skip) {
      console.log('[golang-slugify-golden] `go` not found on PATH — skipping (see @file note)');
    }
  });

  it('ACCEPTS a correct reference implementation (positive)', (t) => {
    if (skip) return t.skip('go toolchain not available');
    const dir = layout();
    install(dir, REFERENCE_SLUGIFY);
    const { code, out } = verify(dir);
    assert.strictEqual(code, 0, `expected PASS, got:\n${out}`);
    assert.match(out, /PASS/);
  });

  it('REJECTS a wrong implementation (negative)', (t) => {
    if (skip) return t.skip('go toolchain not available');
    const dir = layout();
    install(dir, BROKEN_SLUGIFY);
    const { code, out } = verify(dir);
    assert.notStrictEqual(code, 0, `expected FAIL, got:\n${out}`);
    assert.match(out, /FAIL/);
  });

  it('REJECTS a missing slugify.go (negative)', (t) => {
    if (skip) return t.skip('go toolchain not available');
    const dir = layout();
    const { code, out } = verify(dir);
    assert.notStrictEqual(code, 0, 'expected FAIL for missing artifact');
    assert.match(out, /FAIL: slugify\.go missing/);
  });

  it('the fixture root itself stays a clean, buildable Go module (golden/*.tmpl never collides)', (t) => {
    if (skip) return t.skip('go toolchain not available');
    const dir = layout();
    install(dir, REFERENCE_SLUGIFY);
    const build = spawnSync('go', ['build', '-C', dir, './...'], { encoding: 'utf8' });
    assert.strictEqual(build.status, 0, `go build failed:\n${build.stdout}${build.stderr}`);
    const vet = spawnSync('go', ['vet', '-C', dir, './...'], { encoding: 'utf8' });
    assert.strictEqual(vet.status, 0, `go vet failed:\n${vet.stdout}${vet.stderr}`);
  });
});
