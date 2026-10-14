// @file: Project-level contract for directive markup semantics.
// @consumers: CI, directive authors, coding agents
// @tasks: TSK-97

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('directive markup contract', () => {
  it('defines directives as HTML-like prompt text at the start of AGENTS.md', () => {
    const agents = fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf-8');
    const rulePosition = agents.indexOf('## Directive markup — mandatory');
    const projectPosition = agents.indexOf('## Project description');

    assert.ok(rulePosition > 0 && rulePosition < projectPosition);
    assert.match(agents, /HTML-like prompt markup, а не XML-документы/);
    assert.match(agents, /Не запускай XML parser\/validator/);
    assert.match(agents, /тестируй поведение и смысловые anchors, а не XML-валидность/);
  });
});
