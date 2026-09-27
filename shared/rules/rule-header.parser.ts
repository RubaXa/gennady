// @file: Strict lexical parser for embedded rule metadata; prompt bodies are deliberately opaque.
// @consumers: RuleRegistry
// @spec: CLI-RULES

import { createHash } from 'node:crypto';
import type { RuleDescriptor } from './rule-descriptor.type.ts';

type RulePredicate = Readonly<Record<string, readonly string[]>>;

const ROOT_ATTRIBUTES = new Set(['rule-id', 'rule-schema', 'type', 'ver']);
const PREDICATE_ATTRIBUTES = new Set([
  'language',
  'role',
  'framework',
  'pattern',
  'operation',
  'intent',
  'platform',
  'tool',
]);
const ENTITY_VALUES: Readonly<Record<string, string>> = Object.freeze({
  quot: '"',
  apos: "'",
  amp: '&',
  lt: '<',
  gt: '>',
});

function malformed(source: string, detail: string): never {
  throw new Error(`RULE_HEADER_MALFORMED: ${source}: ${detail}`);
}

function decodeScalar(source: string, name: string, raw: string): string {
  if (/\p{Cc}/u.test(raw)) malformed(source, `${name} contains a control character`);
  let result = '';
  for (let index = 0; index < raw.length; ) {
    const character = raw[index] ?? '';
    if (character !== '&') {
      if (character === '<' || character === '>') {
        malformed(source, `${name} contains an unescaped angle bracket`);
      }
      result += character;
      index += character.length;
      continue;
    }
    const entity = /^&([a-z]+);/.exec(raw.slice(index));
    if (entity === null || ENTITY_VALUES[entity[1] ?? ''] === undefined) {
      malformed(source, `${name} contains an unknown or malformed entity`);
    }
    result += ENTITY_VALUES[entity[1] ?? ''];
    index += entity[0].length;
  }
  const normalized = result.trim();
  if (normalized === '') malformed(source, `${name} must not be empty`);
  return normalized;
}

function parseAttributes(
  source: string,
  raw: string,
  allowed: ReadonlySet<string>,
  context: string
): Readonly<Record<string, string>> {
  const attributes: Record<string, string> = {};
  let rest = raw;
  while (rest !== '') {
    const whitespace = /^\s+/.exec(rest);
    if (whitespace === null)
      malformed(source, `${context} attributes require whitespace separators`);
    rest = rest.slice(whitespace[0].length);
    if (rest === '') break;
    const match = /^([a-z][a-z0-9-]*)\s*=\s*("([^"]*)"|'([^']*)')/.exec(rest);
    if (match === null) malformed(source, `${context} contains an unquoted or malformed attribute`);
    const name = match[1] ?? '';
    if (!allowed.has(name)) malformed(source, `${context} contains unknown attribute ${name}`);
    if (Object.hasOwn(attributes, name))
      malformed(source, `${context} duplicates attribute ${name}`);
    attributes[name] = decodeScalar(source, `${context}.${name}`, match[3] ?? match[4] ?? '');
    rest = rest.slice(match[0].length);
  }
  return attributes;
}

function predicate(
  source: string,
  tag: 'When' | 'Unless',
  attributes: Readonly<Record<string, string>>
): RulePredicate {
  const entries = Object.entries(attributes);
  if (entries.length === 0) malformed(source, `${tag} requires at least one predicate attribute`);
  return Object.freeze(
    Object.fromEntries(
      entries
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, scalar]) => {
          const values = scalar.split(',').map((value) => value.trim());
          if (values.some((value) => value === '')) {
            malformed(source, `${tag}.${name} contains an empty comma-list member`);
          }
          return [name, Object.freeze([...new Set(values)].sort())];
        })
    )
  );
}

function parseMeta(
  source: string,
  raw: string
): {
  when: readonly RulePredicate[];
  unless: readonly RulePredicate[];
  dependsOn: readonly string[];
} {
  const when: RulePredicate[] = [];
  const unless: RulePredicate[] = [];
  const dependsOn: string[] = [];
  let rest = raw;
  while (rest !== '') {
    const whitespace = /^\s*/.exec(rest)?.[0] ?? '';
    rest = rest.slice(whitespace.length);
    if (rest === '') break;
    const child = /^<(When|Unless|DependsOn)([^<>]*?)\/>/.exec(rest);
    if (child === null)
      malformed(source, 'Meta permits only self-closing When, Unless and DependsOn');
    const tag = child[1] as 'When' | 'Unless' | 'DependsOn';
    const allowed = tag === 'DependsOn' ? new Set(['rule']) : PREDICATE_ATTRIBUTES;
    const attributes = parseAttributes(source, child[2] ?? '', allowed, tag);
    if (tag === 'DependsOn') {
      if (Object.keys(attributes).length !== 1 || attributes.rule === undefined) {
        malformed(source, 'DependsOn requires exactly one rule attribute');
      }
      dependsOn.push(attributes.rule);
    } else if (tag === 'When') {
      when.push(predicate(source, tag, attributes));
    } else {
      unless.push(predicate(source, tag, attributes));
    }
    rest = rest.slice(child[0].length);
  }
  return {
    when: Object.freeze(when),
    unless: Object.freeze(unless),
    dependsOn: Object.freeze([...new Set(dependsOn)].sort()),
  };
}

/**
 * @purpose Parse only the strict lexical header and preserve all prompt body bytes without XML semantics.
 * @param source Stable source identity used in every fail-closed diagnostic.
 * @param content Exact prompt-file bytes.
 * @returns Deeply immutable descriptor with exact opaque body and deterministic identity.
 */
export function parseRuleHeader(source: string, content: string): RuleDescriptor {
  const opening = /^<([A-Za-z][A-Za-z0-9_-]*)([^<>]*)>/.exec(content);
  if (opening === null)
    malformed(source, 'first bytes must be one literal non-self-closing root tag');
  if ((opening[2] ?? '').trimEnd().endsWith('/'))
    malformed(source, 'root tag must not be self-closing');
  const rootTag = opening[1] ?? '';
  const rootAttributes = parseAttributes(source, opening[2] ?? '', ROOT_ATTRIBUTES, rootTag);
  for (const name of ROOT_ATTRIBUTES) {
    if (rootAttributes[name] === undefined) malformed(source, `${rootTag} is missing ${name}`);
  }
  const afterRoot = content.slice(opening[0].length);
  const metaOpening = /^(\s*)<Meta>/.exec(afterRoot);
  if (metaOpening === null)
    malformed(source, 'Meta must be the immediate header after root whitespace');
  const metaStart = metaOpening[0].length;
  const metaClose = afterRoot.indexOf('</Meta>', metaStart);
  if (metaClose < 0) malformed(source, 'Meta has no literal closing tag');
  const metadata = parseMeta(source, afterRoot.slice(metaStart, metaClose));
  const bodyStart = metaClose + '</Meta>'.length;
  const trailing = /(?:\r?\n)?$/.exec(content)?.[0] ?? '';
  const finalClose = `</${rootTag}>`;
  const closeStart = content.length - trailing.length - finalClose.length;
  if (
    closeStart < opening[0].length ||
    content.slice(closeStart, closeStart + finalClose.length) !== finalClose
  ) {
    malformed(source, `final literal close must be ${finalClose}`);
  }
  const absoluteBodyStart = opening[0].length + bodyStart;
  if (absoluteBodyStart > closeStart) malformed(source, 'Meta overlaps the final root close');
  const body = content.slice(absoluteBodyStart, closeStart);
  const descriptor: RuleDescriptor = {
    rootTag,
    ruleId: rootAttributes['rule-id'] ?? '',
    ruleSchema: rootAttributes['rule-schema'] ?? '',
    type: rootAttributes.type ?? '',
    version: rootAttributes.ver ?? '',
    ...metadata,
    source,
    body,
    bodyDigest: `sha256:${createHash('sha256').update(body).digest('hex')}`,
  };
  return Object.freeze(descriptor);
}
