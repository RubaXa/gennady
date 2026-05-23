// @file: Generate code review (critical remarks) via LLM considering language specs.
// @consumers: review.cmd
// @tasks: N/A

import { AiLegacyCore } from '../ai-legacy/ai-legacy-core.ts';
import { prompts } from '../prompts/index.ts';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LANG_SPECS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'specs');

type ReviewGenInit = {
  timeout?: number;
};

type SpecGlobal = {
  properties?: Record<
    string,
    { exceptions?: { type: string; description: string }[]; type: string }
  >;
};
type SpecMethods = { methods?: Record<string, { exceptions?: unknown[]; hint?: string[] }> };
type SpecShape = Record<string, SpecGlobal & SpecMethods>;

/**
 * @purpose Generate code review (critical remarks) via LLM considering language specs.
 * @invariant Uses AiLegacyCore and specs from specs/{lang}; returns empty string on error.
 * @consumer CLI (cmd/review)
 */
export class ReviewGen {
  protected _langSpecs: Record<string, SpecShape> = {};
  protected init: ReviewGenInit & {
    basePromptTemplate: string;
    timeout: number;
    logger?: typeof import('../../../shared/common/logger.ts').logger;
  };

  constructor(init: ReviewGenInit = {}) {
    this.init = {
      basePromptTemplate: prompts.review('base'),
      timeout: 120,
      ...init,
    };

    this._ai = new AiLegacyCore({
      logger: this.init.logger,
      timeout: this.init.timeout,
    });
  }

  protected _ai: AiLegacyCore;

  /** @purpose Instance of AiLegacyCore for calling LLM. */
  get ai(): AiLegacyCore {
    return this._ai;
  }

  /** @purpose Logger (if passed during initialization). */
  get logger(): typeof import('../../../shared/common/logger.ts').logger | undefined {
    return this.init.logger;
  }

  /**
   * @purpose Generate review text from code and list of languages.
   * @param code Source code for analysis.
   * @param [langs] Languages (default derived from extension in code).
   * @returns Review text from LLM.
   * @sideEffect Network: request to AI; Filesystem: reading specs on first access.
   */
  async generate(
    code: string,
    langs: string[] = [code.includes('.ts') ? 'TypeScript' : 'JavaScript']
  ): Promise<string> {
    const input = this.init.basePromptTemplate
      .replaceAll('{LANGUAGES}', langs.join(', '))
      .replaceAll('\n{EXTRA_RULES}\n', this._getExtraRulesPrompt(langs, code))
      .replaceAll('{INPUT}', code);

    return this._ai.generate(input);
  }

  protected _getExtraRulesPrompt(langs: string[], code: string): string {
    const spec = this._loadSpec(langs);

    const globals = Object.keys(spec.Global?.properties ?? {});
    const rGlobals = new RegExp(`\\b(${globals.join('|')})\\b`, 'g');
    const exists: Record<string, boolean> = {};
    let prompt = '';
    let matches: RegExpExecArray | null = null;

    while ((matches = rGlobals.exec(code))) {
      const name = matches[0];
      const prop = spec.Global?.properties?.[name];
      if (!prop) continue;

      const { exceptions, type } = prop;

      if (!exists[name]) {
        exists[name] = true;

        if (exceptions?.length) {
          prompt += `## ${name} handling:\n`;
          exceptions.forEach(
            ({ type: exType, description }: { type: string; description: string }) => {
              prompt += `- ${exType}: ${description}\n`;
            }
          );
        }
      }

      const typeSpec = spec[type];
      const methods = typeSpec?.methods;
      if (methods) {
        Object.entries(methods).forEach(([method, meta]) => {
          const methodEx = (meta as { exceptions?: unknown[]; hint?: string[] }).exceptions;
          const hint = (meta as { exceptions?: unknown[]; hint?: string[] }).hint;
          if (
            Array.isArray(methodEx) &&
            methodEx.length > 0 &&
            code.includes(method) &&
            Array.isArray(hint)
          ) {
            const key = `${name}.${method}`;
            if (!exists[key]) {
              exists[key] = true;
              prompt += `## **${key}** handling:\n`;
              prompt += hint.join('\n');
            }
          }
        });
      }
    }

    return prompt ? `\n${prompt}\n` : '';
  }

  protected _loadSpec(langs: string[]): SpecShape {
    return langs.reduce((spec: SpecShape, lang) => {
      const specName = lang === 'JavaScript' || lang === 'TypeScript' ? 'js' : lang;
      const specPath = join(LANG_SPECS_DIR, specName);

      this._langSpecs[specName] = {};

      try {
        for (const entry of readdirSync(specPath)) {
          if (!entry.endsWith('.json')) continue;

          const rawJson = readFileSync(join(specPath, entry)).toString();
          const json = JSON.parse(rawJson) as SpecShape;
          Object.assign(this._langSpecs[specName], json);
        }
      } catch {
        // spec dir may not exist for all langs
      }

      return {
        ...spec,
        ...this._langSpecs[specName],
      };
    }, {});
  }
}
