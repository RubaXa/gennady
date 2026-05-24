// @file: Generate commit message from staged diff via LLM.
// @consumers: commit.cmd
// @tasks: N/A

import { AiLegacyCore } from '../ai-legacy/ai-legacy-core.ts';
import { getGitDiffInfo } from '../../../shared/backend/git/git-core.ts';
import { prompts } from '../prompts/index.ts';
import { logger } from '../../../shared/common/logger.ts';
import { style } from '../../../shared/common/style.ts';
import { xmlCommitMessageToJson } from '../../../shared/common/xml.ts';

type CommitGenInit = {
  mode?: string;
  oneline?: boolean;
  targetBranch?: string;
  task?: string | number;
  timeout?: number;
  [key: string]: unknown;
};

/**
 * @purpose Generate commit message from staged diff via LLM.
 * @invariant Uses AiLegacyCore and getGitDiffInfo; returns undefined if diff is empty.
 * @consumer CLI (cmd/commit)
 */
export class CommitGen {
  /** @purpose Configuration with defaults for mode, prompts, timeout. */
  protected init: CommitGenInit & {
    mode: string;
    oneline: boolean;
    targetBranch?: string;
    task?: string | number;
    logger: typeof logger;
    promptCommitMessage: string;
    promptCommitChangeset: string;
    timeout: number;
  };
  /** @purpose AI core instance for LLM requests. */
  protected ai: AiLegacyCore;

  /**
   * @purpose Initialize CommitGen with configuration and AI core.
   * @param init Configuration overrides (mode, oneline, targetBranch, task, timeout). */
  constructor(init: CommitGenInit = {}) {
    this.init = {
      mode: 'auto',
      oneline: false,
      targetBranch: undefined,
      task: undefined,
      logger,
      promptCommitMessage: prompts.commit('message'),
      promptCommitChangeset: prompts.commit('changeset'),
      timeout: 120,
      ...init,
    };

    this.ai = new AiLegacyCore({
      logger: this.init.logger,
      timeout: this.init.timeout,
    });
  }

  /** @purpose Get the logger instance used during generation.
   * @returns Logger instance. */
  get logger(): typeof logger {
    return this.init.logger;
  }

  /** @purpose Commit output mode: auto | oneline | detailed.
   * @returns Mode string. */
  get mode(): string {
    return this.init.mode;
  }

  /** @purpose Active AI model name (from the first available rc).
   * @returns Model name string or undefined. */
  get model(): string | undefined {
    return this.ai.model;
  }

  /** @purpose Active model API URL.
   * @returns API URL string or undefined. */
  get apiUrl(): string | undefined {
    return this.ai.apiUrl;
  }

  /** @purpose Branch against which the diff is built (if specified).
   * @returns Target branch name or undefined. */
  get targetBranch(): string | undefined {
    return this.init.targetBranch;
  }

  /** @purpose Task identifier for substitution in subject (optional).
   * @returns Task ID string or number, or undefined. */
  get task(): string | number | undefined {
    return this.init.task;
  }

  /**
   * @purpose Call LLM with a single prompt without think blocks (for tests or custom input).
   * @param input Prompt text.
   * @returns Model response as string.
   * @sideEffect Network: request to AI API.
   */
  async fetchPrompt(input: string): Promise<string> {
    return this.ai.generate(`/no_think ${input} /no_think`);
  }

  /**
   * @purpose Generate commit message from staged diff (batches → changeset → message).
   * @returns Message string (oneline or with description) or undefined on empty diff/error.
   * @sideEffect Network: requests to AI; Logs: info/warn/debug.
   */
  async generate(): Promise<string | undefined> {
    const startedAt = performance.now();
    this.init.logger.info(
      `[CommitGen#generate] [idle → loading] targetBranch=${this.init.targetBranch ?? 'HEAD'}`
    );

    const {
      commitCount,
      parsedCodeDiff,
      parsedCodeTokens,
      parsedCodeChunkMaxTokens,
      programmingLanguages,
    } = getGitDiffInfo(this.init.targetBranch);

    if (parsedCodeDiff.length === 0) {
      this.init.logger.warn(`[CommitGen#generate] [loading → skipped] No staged changes`);
      this.init.logger.info(style.italic.gray(`Hint: git add .`));
      return;
    }

    const mode = this.init.oneline
      ? 'oneline'
      : this.init.mode === 'auto'
        ? this.init.targetBranch
          ? 'detailed'
          : commitCount > 1 && parsedCodeDiff.length < 5
            ? 'oneline'
            : 'detailed'
        : this.init.mode;

    this.init.logger.info(
      `[CommitGen#generate] [loading → batching] mode=${style.bold.magentaBright(mode)} languages=${programmingLanguages.join(', ')} tokens=${parsedCodeTokens} (max per file: ${parsedCodeChunkMaxTokens})`
    );

    const batches = this.ai.createPromptsBatchesByDiff(parsedCodeDiff);
    this.init.logger.debug(`[CommitGen#generate] [batching → ready] queue=${batches.length}`);

    const startGenTime = performance.now();
    const changesetList = await Promise.all(
      batches.map(async (batch) => {
        this.init.logger.debug(
          `[CommitGen#generate] [batching → task] ${batch.tokens} tokens, ${batch.languages?.join('/')}`
        );

        const prompt = this.init.promptCommitChangeset
          .replaceAll('{languages}', batch.languages.join('/'))
          .replaceAll('{input}', batch.diff);

        return this.fetchPrompt(prompt);
      })
    );

    const changesetTime = performance.now() - startGenTime;
    this.init.logger.info(
      `[CommitGen#generate] [batching → changeset] (${(changesetTime / 1000).toFixed(2)}s)`
    );

    const startMsgTime = performance.now();
    const changeset = `<changeset>\n  ${changesetList
      .flatMap((text) => {
        const changesetMatch = text.match(/<changeset>([\s\S]*?)<\/changeset>/)?.[1];
        const changes = changesetMatch?.match(/<change.*?>.*?<\/change>/g);
        return changes ?? [];
      })
      .join('\n  ')}\n</changeset>`;

    const result = await this.fetchPrompt(
      this.init.promptCommitMessage.replaceAll('{input}', changeset)
    );

    const msgTime = performance.now() - startMsgTime;
    this.init.logger.info(
      `[CommitGen#generate] [changeset → message] (${(msgTime / 1000).toFixed(2)}s)`
    );

    const message = xmlCommitMessageToJson(result);
    if (!message) return undefined;

    let subject = message.subject;
    if (this.init.task) {
      const taskId = this.init.task.toString();
      const formattedTaskId = /^\d+$/.test(taskId) ? `#${taskId}` : taskId;
      subject = `${subject} (${formattedTaskId})`;
    }

    const totalTime = performance.now() - startedAt;
    this.init.logger.info(
      `[CommitGen#generate] [message → completed] (${(totalTime / 1000).toFixed(2)}ms)`
    );

    if (mode === 'oneline') {
      return `${message.type}: ${subject} ${message.icon}`;
    }

    return `${message.type}: ${subject} ${message.icon}\n\n${message.description}`;
  }
}
