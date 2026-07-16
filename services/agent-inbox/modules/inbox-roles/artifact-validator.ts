// @file: ArtifactValidator — mechanical validation of session-produced task artifacts: structure/
//   schema (delegated to inbox-review-plan's own gate), mermaid syntax, coverage ledger (every
//   Scope file → findings or explicit no-findings), tool-call cross-check (telemetry vs Scope).
// @consumers: RoleInstance (gate nodes)
// @tasks: TSK-113

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  validateReviewReports,
  type ValidateError as ReviewPlanValidateError,
} from '../../../../cli/cmd/inbox-review-plan/inbox-review-plan.cmd.ts';
import type { ToolCall } from '../inbox-opencode/opencode.port.ts';
import { extractMermaidBlocks, validateMermaid } from '../../../../shared/mermaid/mermaid.ts';

/** @purpose One schema/coverage violation, file-scoped for point retry by the recovery ladder. */
export type ValidateError = ReviewPlanValidateError;

/** @purpose Outcome of ArtifactValidator.validate — mirrors inbox-review-plan's own gate shape. */
export type ValidateResult = { ok: true } | { ok: false; errors: ValidateError[] };

/** @purpose One ```mermaid fenced block extracted from a document body, with its source file for error scoping. */
type MermaidBlock = { file: string; body: string };

/**
 * @purpose Mechanically verifies that a session did the work per plan — structure, not text
 * quality (that stays the directives' job, per D57).
 * @invariant Delegates structure/schema/dictionary checks to `validateReviewReports` (the same
 *   gate `inbox-review-plan --validate` runs) instead of re-implementing them — see
 *   `cli/cmd/inbox-review-plan/inbox-review-plan.cmd.ts#validateReviewReports`.
 * @invariant Coverage ledger and tool-call cross-check only apply at `stage: 'filled'` — the same
 *   stage inbox-review-plan gates synthesis at.
 * @consumer RoleInstance (gate nodes)
 */
export class ArtifactValidator {
  /**
   * @purpose Validate a scaffolded report directory: schema gate + coverage ledger + tool-call
   * cross-check + mermaid syntax.
   * @param dir Per-MR, per-head report directory (as produced by `inbox-review-plan --scaffold`).
   * @param stage `enriched` gates dispatch (Context filled); `filled` gates synthesis (all sections).
   * @param [toolCalls] Tool-call telemetry from the opencode session (file paths actually opened) —
   *   absent/empty telemetry degrades the cross-check open (no false positives when unavailable).
   * @returns `{ ok: true }` or `{ ok: false, errors }` — one entry per violation, file-scoped.
   * @sideEffect Reads PLAN.md, `tasks/*.task.md`, and README.md under `dir`; lazily loads mermaid+jsdom when a diagram is present.
   */
  async validate(
    dir: string,
    stage: 'enriched' | 'filled',
    toolCalls: ToolCall[] = []
  ): Promise<ValidateResult> {
    const errors: ValidateError[] = [];

    const base = validateReviewReports(dir, stage);
    if (!base.ok) errors.push(...base.errors);

    errors.push(...(await this._verifyMermaidSyntax(dir)));

    if (stage === 'filled') {
      errors.push(...this._verifyCoverageLedger(dir));
      errors.push(...this._verifyToolCallCoverage(dir, toolCalls));
    }

    return errors.length > 0 ? { ok: false, errors } : { ok: true };
  }

  // ─── Coverage ledger ────────────────────────────────────────────────────────

  /**
   * @purpose Every Scope file must be mentioned in the findings sections, or covered by an
   * explicit blanket no-findings statement — never silently unaccounted for.
   * @param dir Report directory containing `tasks/*.task.md`.
   * @returns One error per uncovered scope file.
   */
  protected _verifyCoverageLedger(dir: string): ValidateError[] {
    const errors: ValidateError[] = [];
    const tasksDir = join(dir, 'tasks');
    if (!existsSync(tasksDir)) return errors;

    for (const fileName of readdirSync(tasksDir)) {
      if (!fileName.endsWith('.task.md')) continue;
      const taskPath = join(tasksDir, fileName);
      const content = readFileSync(taskPath, 'utf8');
      const { frontmatter, body } = this._parseFrontmatter(content);
      const scopeFiles = Array.isArray(frontmatter.files) ? frontmatter.files : [];
      if (scopeFiles.length === 0) continue;

      const findingsBody = this._extractSection(body, 'Находки') ?? '';
      const candidatesBody = this._extractSection(body, 'Кандидаты') ?? '';
      const evidenceText = `${findingsBody}\n${candidatesBody}`;
      const hasBlanketNoFindings = /нет\s+находок|no\s+findings/i.test(findingsBody);

      for (const scopeFile of scopeFiles) {
        if (hasBlanketNoFindings) continue;
        if (evidenceText.includes(scopeFile)) continue;
        errors.push({
          file: taskPath,
          error: `coverage ledger: файл "${scopeFile}" без находок и без явного no-findings`,
        });
      }
    }
    return errors;
  }

  // ─── Tool-call cross-check ───────────────────────────────────────────────────

  /**
   * @purpose Cross-checks tool-call telemetry (fact) against Scope — an unopened Scope file is a
   * self-report mismatch, not proof of review.
   * @param dir Report directory containing `tasks/*.task.md`.
   * @param toolCalls Telemetry from the opencode session.
   * @returns One error per untouched Scope file; empty when telemetry is unavailable.
   */
  protected _verifyToolCallCoverage(dir: string, toolCalls: ToolCall[]): ValidateError[] {
    if (toolCalls.length === 0) return [];

    const errors: ValidateError[] = [];
    const touchedPaths = new Set(toolCalls.map((c) => c.path));
    const tasksDir = join(dir, 'tasks');
    if (!existsSync(tasksDir)) return errors;

    for (const fileName of readdirSync(tasksDir)) {
      if (!fileName.endsWith('.task.md')) continue;
      const taskPath = join(tasksDir, fileName);
      const { frontmatter } = this._parseFrontmatter(readFileSync(taskPath, 'utf8'));
      const scopeFiles = Array.isArray(frontmatter.files) ? frontmatter.files : [];

      for (const scopeFile of scopeFiles) {
        const opened = [...touchedPaths].some((p) => p === scopeFile || p.endsWith(scopeFile));
        if (!opened) {
          errors.push({
            file: taskPath,
            error: `tool-call сверка: файл "${scopeFile}" из Область не открывался агентом`,
          });
        }
      }
    }
    return errors;
  }

  // ─── Mermaid syntax ───────────────────────────────────────────────────────────

  /**
   * @purpose Validate every mermaid block through the mermaid parser (spec §4, not regexp) — catches
   *   bad diagram types and in-block grammar errors.
   * @invariant mermaid+jsdom load lazily and only when at least one ```mermaid block is present, so
   *   diagram-free reports never pull in the browser lib.
   * @param dir Report directory to scan (README.md + task files).
   * @returns One error per mermaid block the parser rejects, file-scoped.
   * @sideEffect Lazily loads mermaid+jsdom (see `loadMermaidParse`) when a diagram is present.
   */
  protected async _verifyMermaidSyntax(dir: string): Promise<ValidateError[]> {
    const errors: ValidateError[] = [];
    const candidates = [join(dir, 'README.md')];
    const tasksDir = join(dir, 'tasks');
    if (existsSync(tasksDir)) {
      for (const fileName of readdirSync(tasksDir)) {
        if (fileName.endsWith('.task.md')) candidates.push(join(tasksDir, fileName));
      }
    }

    const blocks: MermaidBlock[] = [];
    for (const filePath of candidates) {
      if (!existsSync(filePath)) continue;
      blocks.push(...this._extractMermaidBlocks(filePath, readFileSync(filePath, 'utf8')));
    }
    if (blocks.length === 0) return errors;

    for (const block of blocks) {
      const err = await validateMermaid(block.body);
      if (err !== null) errors.push({ file: block.file, error: `mermaid: ${err}` });
    }
    return errors;
  }

  /**
   * @purpose Extract every closed ```mermaid ... ``` block from a document body.
   * @param file Source file path — carried into each block for error scoping.
   * @param content Full document text.
   * @returns Array of mermaid block bodies (fence markers stripped).
   */
  protected _extractMermaidBlocks(file: string, content: string): MermaidBlock[] {
    return extractMermaidBlocks(content).map((body) => ({ file, body }));
  }

  // ─── Shared document parsing (frontmatter + section extraction) ─────────────
  // purpose: mirrors inbox-review-plan's own minimal parser — the pipeline only ever reads back
  // documents it generated itself, so a line-based parser is sufficient (no general YAML support).

  /**
   * @purpose Parse a `---`-delimited frontmatter block plus the remaining body.
   * @param content Full document text.
   * @returns Frontmatter (scalar or list values) and the body after the closing `---`.
   */
  protected _parseFrontmatter(content: string): {
    frontmatter: Record<string, string | string[]>;
    body: string;
  } {
    const lines = content.split('\n');
    if (lines[0]?.trim() !== '---') return { frontmatter: {}, body: content };
    const end = lines.indexOf('---', 1);
    if (end === -1) return { frontmatter: {}, body: content };

    const frontmatter: Record<string, string | string[]> = {};
    let currentListKey: string | null = null;
    for (let i = 1; i < end; i++) {
      const line = lines[i];
      const listItem = /^\s*-\s+(.*)$/.exec(line);
      if (listItem && currentListKey) {
        (frontmatter[currentListKey] as string[]).push(listItem[1].trim());
        continue;
      }
      const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
      if (!kv) continue;
      const [, key, value] = kv;
      if (value === '') {
        frontmatter[key] = [];
        currentListKey = key;
      } else {
        frontmatter[key] = value.trim();
        currentListKey = null;
      }
    }
    return { frontmatter, body: lines.slice(end + 1).join('\n') };
  }

  /**
   * @purpose Extract the text under a `## <heading>` section, up to the next `## ` heading.
   * @param body Document body (post-frontmatter).
   * @param heading Section heading, without the `## ` prefix.
   * @returns Section text (trimmed) or null when the heading is absent.
   */
  protected _extractSection(body: string, heading: string): string | null {
    const match = new RegExp(`^## ${heading}\\s*$`, 'm').exec(body);
    if (!match) return null;
    const rest = body.slice(match.index + match[0].length);
    const nextHeadingIdx = rest.search(/^## /m);
    return (nextHeadingIdx === -1 ? rest : rest.slice(0, nextHeadingIdx)).trim();
  }
}
