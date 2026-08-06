// @file: Unit tests for PromptCompiler — pointers not inlined, schema in task not system, Handlebars partials.
// @consumers: node:test runner
// @tasks: TSK-160

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PromptCompiler, type CompileContext } from '../prompt-compile.ts';

// ── context factory ──

function createCompiler() {
  return new PromptCompiler({ templateDir: 'ai/kit' });
}

function makeContext(overrides?: Partial<CompileContext>): CompileContext {
  return {
    taskPointer: 'tasks/my-task.md',
    artifacts: [],
    mr: 'https://gitlab.example.com/foo/bar/-/merge_requests/42',
    ...overrides,
  };
}

// ── tests ──

describe('PromptCompiler', () => {
  describe('#compile — pointers not inline', () => {
    it('should emit task pointer as a file path, not inline content', () => {
      const compiler = createCompiler();
      const ctx = makeContext({ taskPointer: 'tasks/review-scaffold.md' });

      const result = compiler.compile(ctx);

      assert.match(result.task, /tasks\/review-scaffold\.md/);
      assert.ok(
        !result.task.includes('# Review Scaffold Task'),
        'task text must not contain inline task content'
      );
    });

    it('should embed pointer to task file in task section', () => {
      const compiler = createCompiler();
      const ctx = makeContext();

      const result = compiler.compile(ctx);

      assert.match(result.task, /Read the task file at the path above/);
      assert.match(result.task, /Task: tasks\/my-task\.md/);
    });
  });

  describe('#compile — schema in task, not system', () => {
    it('should include schema section only in task text', () => {
      const compiler = createCompiler();

      const result = compiler.compile(makeContext());

      assert.match(result.task, /Schema \(in task, not system\)/);
      assert.ok(
        !result.system.includes('Schema') && !result.system.includes('schema'),
        'system text must not contain schema'
      );
    });

    it('should not inline schema content — delegates to task file', () => {
      const compiler = createCompiler();

      const result = compiler.compile(makeContext());

      assert.match(result.task, /Extract it from the task/);
    });
  });

  describe('#compile — artifacts as pointers', () => {
    it('should list artifact file paths, not their content', () => {
      const compiler = createCompiler();
      const ctx = makeContext({
        artifacts: ['out/result.json', 'telemetry/tool-trace.jsonl'],
      });

      const result = compiler.compile(ctx);

      assert.match(result.task, /Artifacts \(pointers, not inline\)/);
      assert.match(result.task, /- out\/result\.json/);
      assert.match(result.task, /- telemetry\/tool-trace\.jsonl/);
    });

    it('should omit artifact section when no artifacts', () => {
      const compiler = createCompiler();
      const ctx = makeContext({ artifacts: [] });

      const result = compiler.compile(ctx);

      assert.ok(!result.task.includes('Artifacts'));
    });
  });

  describe('#compile — system with role and model', () => {
    it('should include role hint in system text', () => {
      const compiler = createCompiler();
      const ctx = makeContext({ role: 'reviewer' });

      const result = compiler.compile(ctx);

      assert.match(result.system, /Role: reviewer/);
    });

    it('should include model hint in system text', () => {
      const compiler = createCompiler();
      const ctx = makeContext({ model: 'llm-proxy/deepseek-v4-pro' });

      const result = compiler.compile(ctx);

      assert.match(result.system, /Model: llm-proxy\/deepseek-v4-pro/);
    });

    it('should produce minimal system text without role or model', () => {
      const compiler = createCompiler();

      const result = compiler.compile(makeContext());

      assert.match(result.system, /Directives loaded from ai\/kit/);
      assert.ok(!result.system.includes('Role:'));
      assert.ok(!result.system.includes('Model:'));
    });
  });

  describe('#compile — MR context pointer', () => {
    it('should include MR pointer in task text', () => {
      const compiler = createCompiler();

      const result = compiler.compile(makeContext());

      assert.match(result.task, /Context \(pointer\)/);
      assert.match(result.task, /MR: https:\/\/gitlab.example.com\/foo\/bar/);
    });
  });

  describe('#compile — fallback without templates', () => {
    it('should produce valid system and task without Handlebars templates', () => {
      const compiler = new PromptCompiler({ templateDir: 'nonexistent/template/dir' });

      const result = compiler.compile(makeContext());

      assert.ok(typeof result.system === 'string');
      assert.ok(typeof result.task === 'string');
      assert.ok(result.system.length > 0);
      assert.ok(result.task.length > 0);
    });

    it('should still produce pointer-based task when partials fail to load', () => {
      const compiler = new PromptCompiler({ templateDir: 'nonexistent/template/dir' });

      const result = compiler.compile(makeContext());

      assert.match(result.task, /Task: tasks\/my-task\.md/);
    });
  });
});
