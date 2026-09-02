// @file: Structural parser and static CLI-schema validator for executable and literal gennady calls
//   inside SDD v2 directive Actions.
// @consumers: directive-tool-contract.test.ts
// @tasks: N/A

export type DocumentedCall = {
  readonly raw: string;
  readonly cmd: string;
  readonly argsRaw: string;
};
export type ActionToolCall = DocumentedCall & {
  readonly stepId: string;
  readonly owner: string;
  readonly result: string;
  readonly actionContext: string;
};
export type ActionToolLiteral = DocumentedCall & {
  readonly stepId: string;
  readonly role: 'example' | 'future' | 'ticket' | 'delegated';
};

const KNOWN_COMMAND_PATTERN = 'sdd-[a-z]+|lint|yagni|testcov|orient';
const PREFIXED = new RegExp(`^npx gennady\\s+(${KNOWN_COMMAND_PATTERN})(.*)$`);
const BARE = new RegExp(`^(?:gennady\\s+)?(${KNOWN_COMMAND_PATTERN})\\b(.*)$`);
const STEP_RE = /<Step id="([^"]+)">([\s\S]*?)<\/Step>/g;
const ACTION_RE = /<Action>([\s\S]*?)<\/Action>/g;
const TOOL_CALL_RE =
  /<ToolCall owner="([a-z][a-z0-9-]*)" result="([a-z][A-Za-z0-9]*)">([\s\S]*?)<\/ToolCall>/g;
const TOOL_LITERAL_RE =
  /<ToolLiteral role="(example|future|ticket|delegated)">([\s\S]*?)<\/ToolLiteral>/g;

function parsePrefixed(raw: string, label: string): DocumentedCall {
  const normalized = raw.replace(/\s+/g, ' ').trim();
  const match = PREFIXED.exec(normalized);
  if (!match)
    throw new Error(`${label}: expected canonical npx gennady command; got ${normalized}`);
  return { raw: normalized, cmd: match[1]!, argsRaw: match[2]!.trim() };
}

/** @purpose Extract backtick-documented CLI mentions for representative black-box fixtures. */
export function extractDocumentedCalls(text: string): DocumentedCall[] {
  const seen = new Set<string>();
  const out: DocumentedCall[] = [];
  for (const match of text.matchAll(/(?<!`)`([^`\n]+)`(?!`)/g)) {
    const span = match[1]!.trim();
    if (seen.has(span)) continue;
    const prefixed = PREFIXED.exec(span);
    const bare = BARE.exec(span);
    const parsed = prefixed ?? (bare && bare[2]!.trim().length > 0 ? bare : null);
    if (!parsed) continue;
    seen.add(span);
    out.push({ raw: span, cmd: parsed[1]!, argsRaw: parsed[2]!.trim() });
  }
  for (const call of [...extractActionToolCalls(text), ...extractActionToolLiterals(text)]) {
    if (seen.has(call.raw)) continue;
    seen.add(call.raw);
    out.push({ raw: call.raw, cmd: call.cmd, argsRaw: call.argsRaw });
  }
  return out;
}

/** @purpose Parse executable ToolCalls and reject unpaired, malformed, or unowned markers. */
export function extractActionToolCalls(text: string): ActionToolCall[] {
  assertPaired(text, 'ToolCall', /<ToolCall\b/g, /<\/ToolCall>/g);
  const out: ActionToolCall[] = [];
  for (const step of text.matchAll(STEP_RE)) {
    for (const action of step[2]!.matchAll(ACTION_RE)) {
      const actionContext = stripToolMarkers(action[1]!);
      for (const marker of action[1]!.matchAll(TOOL_CALL_RE)) {
        out.push({
          ...parsePrefixed(marker[3]!, `${step[1]} ToolCall`),
          stepId: step[1]!,
          owner: marker[1]!,
          result: marker[2]!,
          actionContext,
        });
      }
    }
  }
  const total = text.match(/<ToolCall\b/g)?.length ?? 0;
  if (out.length !== total)
    throw new Error(
      `${total - out.length} ToolCall marker(s) are malformed or outside a paired <Step><Action>`
    );
  return out;
}

/** @purpose Parse deliberately non-executable ToolLiterals and reject malformed ownership. */
export function extractActionToolLiterals(text: string): ActionToolLiteral[] {
  assertPaired(text, 'ToolLiteral', /<ToolLiteral\b/g, /<\/ToolLiteral>/g);
  const out: ActionToolLiteral[] = [];
  for (const step of text.matchAll(STEP_RE)) {
    for (const action of step[2]!.matchAll(ACTION_RE)) {
      for (const marker of action[1]!.matchAll(TOOL_LITERAL_RE)) {
        out.push({
          ...parsePrefixed(marker[2]!, `${step[1]} ToolLiteral`),
          stepId: step[1]!,
          role: marker[1]! as ActionToolLiteral['role'],
        });
      }
    }
  }
  const total = text.match(/<ToolLiteral\b/g)?.length ?? 0;
  if (out.length !== total)
    throw new Error(
      `${total - out.length} ToolLiteral marker(s) are malformed or outside a paired <Step><Action>`
    );
  return out;
}

/** @purpose Find action-level calls which are neither ToolCalls nor ToolLiterals. */
export function unclassifiedActionCommands(text: string): string[] {
  const findings: string[] = [];
  for (const step of text.matchAll(STEP_RE)) {
    for (const action of step[2]!.matchAll(ACTION_RE)) {
      const stripped = stripToolMarkers(action[1]!);
      for (const match of stripped.matchAll(/npx gennady\s+[a-z][a-z0-9-]*[^`\n]*/g)) {
        findings.push(`${step[1]}: ${match[0]!.trim()}`);
      }
    }
  }
  return findings;
}

function stripToolMarkers(action: string): string {
  return action
    .replace(/<ToolCall\b[^>]*>[\s\S]*?<\/ToolCall>/g, '')
    .replace(/<ToolLiteral\b[^>]*>[\s\S]*?<\/ToolLiteral>/g, '');
}

function assertPaired(text: string, name: string, open: RegExp, close: RegExp): void {
  const opens = text.match(open)?.length ?? 0;
  const closes = text.match(close)?.length ?? 0;
  if (opens !== closes) throw new Error(`unpaired ${name} markers: open=${opens}, close=${closes}`);
}

type FlagShape = 'boolean' | 'scalar';
type CommandSchema = {
  readonly flags: Readonly<Record<string, FlagShape>>;
  readonly repeatable?: readonly string[];
  readonly validate: (
    positionals: readonly string[],
    flags: ReadonlyMap<string, readonly string[]>
  ) => string | null;
};
const exactlyOne = (values: readonly boolean[]): boolean => values.filter(Boolean).length === 1;
const has = (flags: ReadonlyMap<string, readonly string[]>, name: string): boolean =>
  flags.has(name);
function schema(
  flags: Readonly<Record<string, FlagShape>>,
  validate: CommandSchema['validate'],
  repeatable: readonly string[] = []
): CommandSchema {
  return { flags, validate, repeatable };
}

// Static shapes mirror the command help/types/dispatcher contracts. Values stay placeholders, but
// unknown/repeated/missing flags cannot enter an Action unnoticed.
const COMMAND_SCHEMAS: Readonly<Record<string, CommandSchema>> = {
  'sdd-state': schema({ '--probe': 'boolean' }, (p) =>
    p.length <= 1 ? null : 'accepts at most one project root'
  ),
  'sdd-sync': schema({}, (p) => (p.length >= 1 ? null : 'requires a ticket')),
  'sdd-extract': schema({}, (p) =>
    p.length === 1 || p.length === 2 ? null : 'requires file[#anchor] or file section'
  ),
  'sdd-orient': schema({ '--scope': 'scalar' }, (p, f) =>
    exactlyOne([p.length === 1 && !has(f, '--scope'), p.length === 0 && has(f, '--scope')])
      ? null
      : 'requires one spec path or --scope <name>'
  ),
  'sdd-task': schema(
    {
      '--phase': 'scalar',
      '--audit-group': 'scalar',
      '--group-scope': 'scalar',
      '--task-scope': 'scalar',
    },
    (p, f) => {
      const modes = ['--audit-group', '--group-scope', '--task-scope'].filter((x) => has(f, x));
      if (modes.length > 1) return 'scope modes are mutually exclusive';
      if (modes.length === 1 && p.length !== 0) return `${modes[0]} takes no positional`;
      if (has(f, '--phase') && p.length !== 1) return '--phase requires exactly one ticket';
      return p.length <= 1 ? null : 'accepts at most one project root/ticket';
    }
  ),
  'sdd-check': schema(
    {
      '--task': 'scalar',
      '--spec': 'scalar',
      '--authoring': 'boolean',
      '--phase': 'scalar',
      '--all': 'boolean',
      '--changed': 'boolean',
    },
    (p, f) => {
      const modes = ['--task', '--spec', '--all', '--changed'].filter((x) => has(f, x));
      if (modes.length !== 1) return 'requires exactly one mode';
      if (has(f, '--authoring') && modes[0] !== '--task' && modes[0] !== '--spec')
        return '--authoring requires --task or --spec';
      if (modes[0] === '--spec' && !has(f, '--authoring')) return '--spec requires --authoring';
      if (has(f, '--phase') && !has(f, '--authoring')) return '--phase requires --authoring';
      if (has(f, '--phase') && modes[0] !== '--task') return '--phase requires --task';
      if ((modes[0] === '--all' || modes[0] === '--changed') && p.length > 1)
        return `${modes[0]} accepts at most one root`;
      if (modes[0] === '--task' || modes[0] === '--spec')
        return p.length === 0 ? null : `${modes[0]} accepts no trailing paths`;
      return null;
    }
  ),
  'sdd-verify': schema(
    { '--task': 'scalar', '--phase': 'scalar', '--profile': 'scalar' },
    (p, f) =>
      p.length === 0 &&
      exactlyOne([
        has(f, '--profile') && !has(f, '--task') && !has(f, '--phase'),
        has(f, '--task') && has(f, '--phase') && !has(f, '--profile'),
      ])
        ? null
        : 'requires --profile or --task with --phase'
  ),
  lint: schema(
    {
      '--autofix': 'boolean',
      '--include-tests': 'boolean',
      '--staged': 'boolean',
      '--verbose': 'boolean',
      '-v': 'boolean',
      '--include-all': 'boolean',
      '--inventory-reverse': 'scalar',
      '--spec': 'scalar',
      '--max-invariants': 'scalar',
      '--max-words': 'scalar',
      '--max-header-words': 'scalar',
      '--max-contract-words': 'scalar',
      '--max-region-comments': 'scalar',
      '--exclude': 'scalar',
    },
    (p, f) =>
      has(f, '--inventory-reverse') && !has(f, '--spec')
        ? '--inventory-reverse requires --spec'
        : p.length > 0 || has(f, '--staged') || has(f, '--inventory-reverse')
          ? null
          : 'requires paths, --staged, or --inventory-reverse',
    ['--exclude']
  ),
  'sdd-new': schema(
    {
      '--scope': 'scalar',
      '--module': 'scalar',
      '--id': 'scalar',
      '--slug': 'scalar',
      '--out': 'scalar',
      '--owner': 'scalar',
      '--list': 'boolean',
      '--manifest': 'boolean',
    },
    (p, f) => {
      if (has(f, '--list')) return p.length === 0 ? null : '--list takes no kind';
      if (p.length !== 1) return 'requires exactly one artifact kind';
      const kind = p[0]!;
      if (
        ![
          'product',
          'library',
          'infrastructure',
          'interface',
          'module',
          'task',
          'module-index',
          'scope-index',
          'project-index',
          'portal',
          'research',
        ].includes(kind)
      )
        return `unknown artifact kind ${kind}`;
      if (has(f, '--manifest')) return null;
      if (kind === 'task' && (!has(f, '--scope') || !has(f, '--id') || !has(f, '--owner')))
        return 'task requires --scope, --id, and --owner';
      if (
        (kind === 'module' || kind === 'module-index') &&
        (!has(f, '--scope') || !has(f, '--module'))
      )
        return `${kind} requires --scope and --module`;
      if (kind === 'research' && (!has(f, '--scope') || !has(f, '--slug')))
        return 'research requires --scope and --slug';
      if (!['portal', 'project-index'].includes(kind) && !has(f, '--scope'))
        return `${kind} requires --scope`;
      return null;
    }
  ),
  'sdd-log': schema(
    {
      '--phase': 'scalar',
      '--content-file': 'scalar',
      '--payload-file': 'scalar',
      '--axiom': 'scalar',
      '--unblock': 'scalar',
    },
    (p, f) => {
      if (p.length < 2) return 'requires ticket and operation';
      const op = p[1];
      if (
        ![
          'round',
          'line',
          'close',
          'phase',
          'handoff',
          'blocker',
          'resolved',
          'complete',
          'authoring-complete',
        ].includes(op!)
      )
        return 'unknown log operation';
      if (op === 'close') return p.length === 2 && f.size === 0 ? null : 'close takes only ticket';
      if (op === 'authoring-complete')
        return p.length === 2 && f.size === 0
          ? null
          : 'authoring-complete takes only the spec path';
      if (op === 'blocker')
        return has(f, '--phase') && has(f, '--payload-file') && p.length === 2
          ? null
          : 'blocker requires --payload-file and --phase';
      if (op === 'phase')
        return p.length === 3 && (!has(f, '--content-file') || f.size === 1)
          ? null
          : 'phase requires PhaseID and optional --content-file';
      if (op === 'round')
        return p.length === 3 || has(f, '--content-file')
          ? null
          : 'round requires content/content-file';
      return has(f, '--phase') && (p.length === 3 || has(f, '--content-file'))
        ? null
        : `${op} requires content/content-file and --phase`;
    }
  ),
  'sdd-migrate': schema(
    {
      '--all': 'boolean',
      '--write': 'boolean',
      '--verify': 'boolean',
      '--from-plan': 'boolean',
      '--scope': 'scalar',
      '--map': 'scalar',
    },
    (p, f) => {
      if (!['anchors', 'plan', 'ids', 'move'].includes(p[0] ?? ''))
        return 'requires a known migration operation';
      if (p[0] === 'move' && !has(f, '--scope')) return 'move requires --scope';
      if (p[0] === 'ids' && !exactlyOne([has(f, '--from-plan'), has(f, '--map')]))
        return 'ids requires --from-plan or --map';
      return p.length <= 2 ? null : 'accepts at most one root/ticket after operation';
    }
  ),
};

/** @purpose Validate a ToolCall's flags and positional shape without executing placeholders. */
export function validateToolCallSyntax(call: DocumentedCall): string | null {
  const commandSchema = COMMAND_SCHEMAS[call.cmd];
  if (!commandSchema) return `no explicit CLI schema for ${call.cmd}`;
  const positionals: string[] = [];
  const flags = new Map<string, string[]>();
  const tokens = tokenize(call.argsRaw);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (!token.startsWith('--') && token !== '-v') {
      positionals.push(token);
      continue;
    }
    const split = token.indexOf('=');
    const name = split === -1 ? token : token.slice(0, split);
    const inline = split === -1 ? undefined : token.slice(split + 1);
    const shape = commandSchema.flags[name];
    if (!shape) return `unknown flag ${name}`;
    const values = flags.get(name) ?? [];
    if (values.length > 0 && !commandSchema.repeatable?.includes(name))
      return `flag ${name} is repeated`;
    if (shape === 'boolean') {
      if (inline !== undefined) return `boolean flag ${name} cannot take a value`;
      values.push('true');
    } else {
      const value = inline ?? tokens[++index];
      if (!value || value.startsWith('-')) return `flag ${name} requires a scalar value`;
      values.push(value);
    }
    flags.set(name, values);
  }
  return commandSchema.validate(positionals, flags);
}

function tokenize(raw: string): string[] {
  return [
    ...raw.matchAll(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\[[^\]]+\]|(?:<[^>]+>|[^\s])+/g),
  ].map((match) => match[0]!);
}
