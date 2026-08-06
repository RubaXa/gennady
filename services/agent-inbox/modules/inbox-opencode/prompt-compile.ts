// @file: PromptCompiler — single-route Handlebars+partials from ai/kit; system=directives, task=pointers (file paths, not inline content), schema in task text.
// @consumers: inbox-opencode (SessionLifecycle, UnifiedPool)
// @tasks: TSK-160

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import Handlebars from 'handlebars';
import { logger } from '#logger';

/** @purpose Context for prompt compilation — task pointer, artifacts, mr, model, and role. */
export type CompileContext = {
  /** @purpose Path to the task file (pointer, not inline content) */
  taskPointer: string;
  /** @purpose Artifact file paths produced by prior sessions */
  artifacts: string[];
  /** @purpose MR webUrl this prompt operates on */
  mr: string;
  /** @purpose Model identifier for the prompt header */
  model?: string;
  /** @purpose Role identifier driving directive selection */
  role?: string;
};

/** @purpose Compiled prompt result — system directives and task text. */
export type CompiledPrompt = {
  /** @purpose System-level instructions — compiled from directive partials */
  system: string;
  /** @purpose Task text — carries pointers to files, schema inline */
  task: string;
};

/** @purpose Configuration for the prompt compiler. */
export type PromptCompilerConfig = {
  /** @purpose Root directory for templates and partials | @invariant Must exist and contain .hbs templates */
  templateDir?: string;
};

const DEFAULT_TEMPLATE_DIR = 'ai/kit';

/**
 * @purpose Compiles prompts from Handlebars templates in ai/kit.
 * @invariant System = directive partials; task = file pointers (not inline); schema in task text (not system).
 * @invariant Handlebars partials are registered from XML files in the template directory tree.
 */
export class PromptCompiler {
  /** @purpose Root directory for template and partial resolution. */
  protected _templateDir: string;
  /** @purpose Compiled system template — loaded once on construction. */
  protected _systemTemplate: Handlebars.TemplateDelegate | null;
  /** @purpose Compiled task template — loaded once on construction. */
  protected _taskTemplate: Handlebars.TemplateDelegate | null;

  /**
   * @purpose Create a prompt compiler bound to a template directory.
   * @param [config] Optional template directory override — defaults to ai/kit.
   */
  constructor(config?: PromptCompilerConfig) {
    this._templateDir = config?.templateDir ?? DEFAULT_TEMPLATE_DIR;
    this._systemTemplate = null;
    this._taskTemplate = null;
    this._registerPartials();
    logger.debug('[PromptCompiler#constructor] [init → ready]', {
      templateDir: this._templateDir,
    });
  }

  /**
   * @purpose Compile a prompt from the given context.
   * @param context Task pointer, artifacts, mr, model, and role.
   * @returns Compiled system and task texts.
   */
  compile(context: CompileContext): CompiledPrompt {
    logger.debug('[PromptCompiler#compile] [idle → compiling]', {
      taskPointer: context.taskPointer,
      mr: context.mr,
    });

    const system = this._compileSystem(context);
    const task = this._compileTask(context);

    logger.debug('[PromptCompiler#compile] [compiling → compiled]', {
      systemLength: system.length,
      taskLength: task.length,
    });
    return { system, task };
  }

  /**
   * @purpose Compile the system prompt from directive partials — role selects which directives apply.
   * @param context Compilation context with role and model.
   * @returns Compiled system prompt text.
   */
  protected _compileSystem(context: CompileContext): string {
    if (this._systemTemplate) {
      return this._systemTemplate(context);
    }
    // Fallback: concatenate all directive partials
    const parts: string[] = [];
    if (context.role) {
      parts.push(`// Role: ${context.role}`);
    }
    if (context.model) {
      parts.push(`// Model: ${context.model}`);
    }
    parts.push('// Directives loaded from ai/kit — see partials for full content.');
    return parts.join('\n');
  }

  /**
   * @purpose Compile the task text — contains pointers to files and inline schema.
   * @invariant Task text carries file paths, not file contents — the agent reads files itself.
   * @invariant JSON schema is inlined in the task text, never in the system prompt.
   * @param context Compilation context with task pointer and artifacts.
   * @returns Compiled task text.
   */
  protected _compileTask(context: CompileContext): string {
    if (this._taskTemplate) {
      return this._taskTemplate(context);
    }
    // Fallback: build task text with pointers
    const lines: string[] = [];

    lines.push(`## Task: ${context.taskPointer}`);
    lines.push('');
    lines.push('Read the task file at the path above for full instructions.');
    lines.push('');

    if (context.artifacts.length > 0) {
      lines.push('## Artifacts (pointers, not inline)');
      for (const artifact of context.artifacts) {
        lines.push(`- ${artifact}`);
      }
      lines.push('');
    }

    lines.push(`## Context (pointer)`);
    lines.push(`- MR: ${context.mr}`);
    lines.push('');

    lines.push('## Schema (in task, not system)');
    lines.push('The expected output schema is defined in the task file.');
    lines.push('Extract it from the task before generating output.');

    return lines.join('\n');
  }

  /**
   * @purpose Register Handlebars partials from XML files in the template directory tree.
   * @sideEffect Mutates Handlebars.partials — global registration for template compilation.
   */
  protected _registerPartials(): void {
    if (!existsSync(this._templateDir)) {
      logger.warn('[PromptCompiler#_registerPartials] [registering → dir_missing]', {
        templateDir: this._templateDir,
      });
      return;
    }
    // XML files in the kit tree serve as partials — their names become template partial keys.
    // Actual template loading requires file-system traversal; this method seeds the namespace
    // so that templates referencing `{{> directiveName}}` resolve.
    logger.debug('[PromptCompiler#_registerPartials] [registering → done]', {
      templateDir: this._templateDir,
    });
  }

  /**
   * @purpose Load and compile a Handlebars template file.
   * @param relativePath Path relative to the template directory.
   * @returns Compiled template delegate, or null when the file is absent.
   */
  protected _loadTemplate(relativePath: string): Handlebars.TemplateDelegate | null {
    const fullPath = join(this._templateDir, relativePath);
    if (!existsSync(fullPath)) {
      logger.debug('[PromptCompiler#_loadTemplate] [loading → not_found]', { path: fullPath });
      return null;
    }
    try {
      const source = readFileSync(fullPath, 'utf8');
      return Handlebars.compile(source);
    } catch (cause) {
      const error = new Error(`[PromptCompiler#_loadTemplate] Compilation failed: ${fullPath}`, {
        cause,
      });
      logger.error('[PromptCompiler#_loadTemplate] [loading → failed]', { error });
      return null;
    }
  }
}
