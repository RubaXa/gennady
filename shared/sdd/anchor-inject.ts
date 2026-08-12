// @file: Inject canonical <!--SECTION:NAME--> anchors into a v1 ticket (plain `## N.` headers) — pure, for migration.
// @consumers: sdd-migrate.cmd
// @tasks: N/A

/**
 * @purpose Map a markdown header (level + text) to its canonical v2 section name, or null when it is not a section.
 * @invariant `## 3. Phases` (the container header) maps to null — only its `### P<N>` children are anchored.
 * @param level Header level (2 for `##`, 3 for `###`).
 * @param text Header text without the leading `#`s.
 * @returns The canonical SECTION name, or null when the header is not a canonical section.
 */
function canonicalName(level: number, text: string): string | null {
  const t = text.trim();

  const phase = /^P(\d+)(\b|_FIX\b)/i.exec(t);
  if (level === 3 && phase) return `PHASE_P${phase[1]}${/_FIX/i.test(t) ? '_FIX' : ''}`;

  if (level !== 2) return null;
  const lower = t.toLowerCase();
  if (/\bmeta\b/.test(lower)) return 'META';
  if (/phases overview/.test(lower)) return 'PHASES_OVERVIEW';
  if (/acceptance criteria|\bbdd\b/.test(lower)) return 'BDD';
  if (/\bverification\b/.test(lower)) return 'VERIFICATION';
  if (/test scenario coverage|test coverage/.test(lower)) return 'TEST_COVERAGE';
  if (/execution log/.test(lower)) return 'EXECUTION_LOG';
  if (/decision log/.test(lower)) return 'DECISION_LOG';
  return null;
}

/** @purpose One `## `/`### ` header line with its canonical section name (null when not a section). */
type Header = { idx: number; level: number; name: string | null };

/** @purpose Collect every `## `/`### ` header with its canonical name. | @param lines File split by `\n`. | @returns Headers in document order. */
function collectHeaders(lines: string[]): Header[] {
  const headers: Header[] = [];
  lines.forEach((line, i) => {
    const m = /^(#{2,3})\s+(.+?)\s*$/.exec(line);
    if (m && m[1] && m[2])
      headers.push({ idx: i, level: m[1].length, name: canonicalName(m[1].length, m[2]) });
  });
  return headers;
}

/**
 * @purpose Body of one canonical v1 header — text from just after it to the next header of level ≤ its own (or EOF).
 * @invariant Reuses `injectAnchors`' header/span logic — a legacy body is exactly what it would wrap in markers.
 * @param content Full markdown (v1, plain headers).
 * @param name Canonical section name (e.g. `META`, `EXECUTION_LOG`).
 * @returns The header's body text, or null when no header maps to `name`.
 */
export function legacyHeaderBody(content: string, name: string): string | null {
  const lines = content.split('\n');
  const headers = collectHeaders(lines);
  const h = headers.find((x) => x.name === name);
  if (!h) return null;
  let end = lines.length;
  for (const next of headers) {
    if (next.idx > h.idx && next.level <= h.level) {
      end = next.idx;
      break;
    }
  }
  return lines.slice(h.idx + 1, end).join('\n');
}

/**
 * @purpose Wrap each canonical section of a v1 ticket in `<!--SECTION:NAME-->` / `<!--/SECTION:NAME-->` markers.
 * @invariant A section spans from its header to the next header of level ≤ its own (or EOF); sections never nest.
 * @invariant Idempotent — a section already carrying its open marker is left untouched.
 * @param content Full ticket markdown (v1, plain headers).
 * @returns The anchored text and the list of section names that were injected (empty when already anchored / not a ticket).
 */
export function injectAnchors(content: string): { text: string; injected: string[] } {
  const lines = content.split('\n');
  const headers = collectHeaders(lines); // every ## / ### header with its canonical name

  // #region START_SPANS — for each canonical header, span ends at the next header of level ≤ its own
  const openAt = new Map<number, string>();
  const closeAt = new Map<number, string>();
  const injected: string[] = [];
  for (let h = 0; h < headers.length; h++) {
    const cur = headers[h];
    if (!cur || cur.name === null) continue;
    if (content.includes(`<!--SECTION:${cur.name}-->`)) continue; // idempotent
    let end = lines.length;
    for (let k = h + 1; k < headers.length; k++) {
      const next = headers[k];
      if (next && next.level <= cur.level) {
        end = next.idx;
        break;
      }
    }
    openAt.set(cur.idx, cur.name);
    closeAt.set(end, cur.name);
    injected.push(cur.name);
  }
  // #endregion END_SPANS

  if (injected.length === 0) return { text: content, injected: [] };

  // #region START_EMIT — splice markers: close before the span-end line, open before the header line
  const out: string[] = [];
  for (let i = 0; i <= lines.length; i++) {
    const close = closeAt.get(i);
    if (close) out.push(`<!--/SECTION:${close}-->`);
    const open = openAt.get(i);
    if (open) out.push(`<!--SECTION:${open}-->`);
    if (i < lines.length) out.push(lines[i] as string);
  }
  // #endregion END_EMIT

  return { text: out.join('\n'), injected };
}
