/**
 * Reusable Handlebars renderer for kit templates.
 * Shared by the static builder (build-directives.ts) and by dynamic tools that pass params.
 */
import Handlebars from 'handlebars';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ARTIFACT_KINDS, TEMPLATES as SDD_TEMPLATES } from '../../shared/sdd/templates.ts';

export const KIT = import.meta.dirname; // ai/kit
export const TEMPLATES = join(KIT, 'templates');
export const OUT_ROOT = join(KIT, '..', 'directives'); // ai/directives
export const UNIT = '  '; // one indent level — switch to "\t" to change the base

export function walk(dir: string, ok: (p: string) => boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, ok));
    else if (ok(p)) out.push(p);
  }
  return out;
}

/** Strip `<!-- source -->` and normalize a brick to base level 0 (open tag col 0, body one unit). */
export function normalizeBrick(raw: string): string {
  let lines = raw.replace(/\n+$/, '').split('\n');
  while (lines.length && lines[0].trim().startsWith('<!--')) lines = lines.slice(1);
  if (!lines.length) return '';
  const open = lines[0].trimStart();
  if (lines.length === 1) return open; // self-closing brick
  const close = lines[lines.length - 1].trimStart();
  const body = lines.slice(1, -1);
  const indents = body.filter((l) => l.trim() !== '').map((l) => l.match(/^ */)![0].length);
  const base = indents.length ? Math.min(...indents) : 0;
  return [open, ...body.map((l) => (l.trim() === '' ? '' : UNIT + l.slice(base))), close].join(
    '\n'
  );
}

/**
 * A standalone partial in Handlebars indents correctly but eats exactly one trailing newline
 * (its own line terminator). Doubling the terminator of every standalone-partial line before
 * compile cancels that out: HB eats one, one survives, so output whitespace faithfully matches
 * the template. Brick interiors are never touched (they live inside the partial files).
 */
export function protectPartialNewlines(src: string): string {
  return src.replace(/^([ \t]*\{\{>[^}]*\}\})[ \t]*$/gm, '$1\n');
}

/** Light cleanup only: strip trailing whitespace, guarantee a final newline. */
export function formatDirective(out: string): string {
  out = out.replace(/[ \t]+$/gm, '');
  return out.endsWith('\n') ? out : out + '\n';
}

/** Partial-name prefix under which each artifact kind's literal skeleton (shared/sdd/templates.ts) is registered. */
export const SKELETON_PARTIAL_PREFIX = 'sdd-skeleton-';

/**
 * Build an isolated Handlebars instance with every kit brick registered as a partial.
 * `extraPartials` (name → raw brick text) lets tests register fixtures through the same pipeline.
 *
 * Also registers one `sdd-skeleton-<kind>` partial per `shared/sdd/templates.ts` ArtifactKind, so
 * contract bricks can pull the literal skeleton in via `{{> "sdd-skeleton-<kind>"}}` instead of
 * duplicating it — `shared/sdd/templates.ts` stays the single source of truth for skeleton markdown.
 */
export function createRenderer(extraPartials: Record<string, string> = {}) {
  const hb = Handlebars.create();
  for (const f of walk(KIT, (p) => p.endsWith('.xml') && !p.startsWith(TEMPLATES + '/'))) {
    const name = relative(KIT, f).replace(/\.xml$/, '');
    hb.registerPartial(name, normalizeBrick(readFileSync(f, 'utf8')));
  }
  for (const kind of ARTIFACT_KINDS) {
    hb.registerPartial(`${SKELETON_PARTIAL_PREFIX}${kind}`, SDD_TEMPLATES[kind].skeleton);
  }
  for (const [name, raw] of Object.entries(extraPartials)) {
    hb.registerPartial(name, normalizeBrick(raw));
  }
  return {
    hb,
    /** Render a template string with data → finished directive text. */
    render(src: string, data: Record<string, unknown> = {}): string {
      return formatDirective(hb.compile(protectPartialNewlines(src), { noEscape: true })(data));
    },
  };
}
