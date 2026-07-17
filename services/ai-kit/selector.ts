// @file: Dynamic directive selector — assembles a review_needed/synthesize directive from
//   `ai/kit` (hbs base template + additive axiom-brick composition) given (sessionType, track,
//   mrShape). Replaces the static NODE_DIRECTIVE_MAP lookup for exactly the four node-ids named
//   in TSK-136 (node_track_review / node_security_lens / node_code_review / node_synthesize).
// @consumers: compile.ts (buildNodePrompt), cli/cmd/inbox (debug directive dump, D-124/AI-46)
// @tasks: TSK-136

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRenderer } from '../../ai/kit/render.ts';
import type { MrShape } from '../agent-inbox/modules/inbox-core/context-builder.ts';

// #region START_RESOLVE_PATHS — derive the kit templates dir from this module's location
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../..');
const templatesDir = resolve(projectRoot, 'ai/kit/templates/sdd-v2/agent-inbox');
// #endregion END_RESOLVE_PATHS

/**
 * @purpose Session kind a directive is assembled for.
 *   `session` — one of the three review_needed lenses (track/security/code).
 *   `synthesize` — the shared reconciliation node (`node_synthesize`).
 */
export type SessionType = 'session' | 'synthesize';

/**
 * @purpose Review track a `session`-kind directive is assembled for — selects the base template.
 *   Irrelevant for `sessionType='synthesize'` (single base template regardless of track).
 */
export type Track = 'logic' | 'security' | 'code';

/**
 * @purpose Thrown when `(sessionType, track)` does not resolve to a known base template.
 * @invariant Always a distinguishable type, never a bare string — callers can `instanceof` it.
 */
export class DirectiveSelectionError extends Error {
  /**
   * @purpose Build a typed error naming the unresolved `(sessionType, track)` pair.
   * @param sessionType The session kind that failed to resolve.
   * @param track The track that failed to resolve, or absent for `synthesize`.
   */
  constructor(sessionType: string, track: string | undefined) {
    super(
      `[selectDirective] No base template for sessionType=${sessionType}, track=${track ?? '(none)'}`
    );
    this.name = 'DirectiveSelectionError';
  }
}

const BASE_TEMPLATE_BY_TRACK: Readonly<Record<Track, string>> = {
  logic: 'track-review.directive.hbs',
  security: 'security-lens.directive.hbs',
  code: 'code-lens.directive.hbs',
};

const SYNTHESIZE_TEMPLATE = 'synthesize.directive.hbs';

/**
 * @purpose Resolve the base hbs template filename for `(sessionType, track)` — the only pair-driven
 *   decision the selector makes (§5.3.1); everything else is additive mrShape composition.
 * @throws {DirectiveSelectionError} Unknown `sessionType`, or `session` with an unknown/absent `track`.
 */
function resolveBaseTemplateName(sessionType: SessionType, track: Track | undefined): string {
  if (sessionType === 'synthesize') return SYNTHESIZE_TEMPLATE;
  if (sessionType === 'session') {
    const templateName = track ? BASE_TEMPLATE_BY_TRACK[track] : undefined;
    if (!templateName) throw new DirectiveSelectionError(sessionType, track);
    return templateName;
  }
  throw new DirectiveSelectionError(sessionType, track);
}

/**
 * @purpose Assemble a directive: base hbs template by `(sessionType, track)` + always-included
 *   mission-adequacy bricks + additive mrShape-trigger bricks (D-121/D-122/D-123, AI-42/43/44).
 * @invariant Pure given its three arguments plus on-disk kit content — no network, no session state.
 * @invariant `mrShape.securityHits`/`mrShape.depManifest` never read here — depth modulators inside
 *   the security lens content itself (§5.3.1), not selector-level triggers.
 * @param sessionType `session` (one of the three lenses) or `synthesize`.
 * @param track Review track for `sessionType='session'` — ignored for `synthesize`.
 * @param mrShape Statanalysis flags (TSK-134) — drives the four additive triggers.
 * @throws {DirectiveSelectionError} Unknown `(sessionType, track)` pair.
 * @throws {Error} Base template file missing from disk (kit content drift).
 * @returns The fully rendered directive string — non-empty for any valid input.
 */
export function selectDirective(
  sessionType: SessionType,
  track: Track | undefined,
  mrShape: MrShape
): string {
  const templateName = resolveBaseTemplateName(sessionType, track);
  const templatePath = resolve(templatesDir, templateName);

  if (!existsSync(templatePath)) {
    throw new Error(`[selectDirective] Base template not found: ${templatePath}`);
  }

  const source = readFileSync(templatePath, 'utf-8');
  const { render } = createRenderer();
  return render(source, { mrShape });
}
