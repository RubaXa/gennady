// @file: verifyDirective — renders TSX directive and compares with original XML via git diff --no-index
// @consumers: directives tests, CI
// @tasks: TSK-76

import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderDirective } from './render-directive.js';
import type { JSXNode } from '../prompt-kit/core/types.js';

/**
 * @purpose Result of TSX-to-XML comparison: match true or diff string.
 */
export type VerifyResult = { match: true } | { match: false; diff: string };

/**
 * @purpose Render a TSX directive file and compare against the original XML via git diff --no-index.
 * @invariant The TSX file must have a default export of a JSXNode or a function returning JSXNode.
 * @param tsxPath Absolute or relative path to the .tsx directive source file
 * @param originalXmlPath Absolute or relative path to the original .xml reference file
 * @throws {Error} When tsxPath or originalXmlPath cannot be read
 * @returns VerifyResult — { match: true } when output is identical; { match: false, diff } otherwise
 */
export async function verifyDirective(
  tsxPath: string,
  originalXmlPath: string
): Promise<VerifyResult> {
  const absoluteTsx = realpathSync(tsxPath);
  const absoluteXml = realpathSync(originalXmlPath);

  let mod: { default: JSXNode | (() => JSXNode) };
  try {
    mod = await import(pathToFileURL(absoluteTsx).href);
  } catch (cause) {
    throw new Error(`[verifyDirective] cannot import ${tsxPath}`, { cause });
  }

  if (!mod.default) {
    throw new Error(`[verifyDirective] ${tsxPath} has no default export`);
  }

  const html = renderDirective(mod.default, 'xml');

  const tmpDir = mkdtempSync(join(tmpdir(), 'ai-tsx-verify-'));
  const tmpFile = join(tmpDir, 'rendered.xml');
  try {
    writeFileSync(tmpFile, html, 'utf8');

    const diff = execFileSync('git', ['diff', '--no-index', '--', absoluteXml, tmpFile], {
      encoding: 'utf8',
      stdio: 'pipe',
    });

    if (diff.trim() === '') {
      return { match: true };
    }
    return { match: false, diff };
  } catch (err: unknown) {
    const stderr = (err as { stderr?: Buffer }).stderr;
    if (stderr && stderr.length > 0) {
      const diffStr = Buffer.isBuffer(stderr) ? stderr.toString('utf8') : String(stderr);
      return { match: false, diff: diffStr };
    }
    if (err instanceof Error) {
      throw new Error('[verifyDirective] git diff failed', { cause: err });
    }
    throw new Error('[verifyDirective] git diff failed');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
