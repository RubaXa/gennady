// @file: ai/inspector — renderMarkdown + clean: token highlight, code spans, and the SECTION-marker regression.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, renderInline } from '../markdown.js';
import { clean } from '../../core/scan.ts';

test('renderInline: highlights tokens/code without wrapping in <p> (for notes)', () => {
  const h = renderInline('run `sdd-state` then STEP_1_PLAN');
  assert.doesNotMatch(h, /<p>|<ul>/);
  assert.match(h, /<code><span class="tok-cmd">sdd-state<\/span><\/code>/);
  assert.match(h, /class="tok-step">STEP_1_PLAN/);
});

test('renders a code span and keeps following text', () => {
  const h = renderMarkdown('run `sdd-task` then done');
  assert.match(h, /<code><span class="tok-cmd">sdd-task<\/span><\/code>/);
  assert.match(h, /then done/);
});

test('classifies tokens by kind', () => {
  const h = renderMarkdown(
    'AX_AUDIT_HOOK STEP_1_PLAN H_NO_TASKS sdd-check ai/x/y.directive.xml FLOW_VERSION'
  );
  assert.match(h, /class="tok-axiom">AX_AUDIT_HOOK/);
  assert.match(h, /class="tok-step">STEP_1_PLAN/);
  assert.match(h, /class="tok-halt">H_NO_TASKS/);
  assert.match(h, /class="tok-cmd">sdd-check/);
  assert.match(h, /class="tok-path">ai\/x\/y\.directive\.xml/);
  assert.match(h, /class="tok-kw">FLOW_VERSION/);
});

test('a code span that contains an HTML comment renders as ONE <code>, text intact', () => {
  const h = renderMarkdown('wraps in `<!--SECTION:-->` markers; verify with `sdd-check` done');
  assert.match(h, /<code>&lt;!--SECTION:--&gt;<\/code>/);
  assert.match(h, /markers; verify with/);
  assert.match(h, /<code><span class="tok-cmd">sdd-check<\/span><\/code>/);
});

test('a lone backtick does not swallow the rest of the line', () => {
  const h = renderMarkdown('a ` b c');
  assert.doesNotMatch(h, /<code>/);
  assert.match(h, /b c/);
});

test('bullets and bold', () => {
  assert.match(renderMarkdown('- one\n- two'), /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.match(renderMarkdown('a **b** c'), /<strong>b<\/strong>/);
});

// --- regression: the STEP_2_ANCHORS bug (clean stripped the comment INSIDE the code span) ---
test('clean keeps an HTML comment that is literal content inside a code span', () => {
  const out = clean('wraps canonical sections in `<!--SECTION:-->` markers');
  assert.match(out, /`<!--SECTION:-->`/);
  assert.match(out, /markers/);
});

test('clean still strips a standalone authoring comment (outside code)', () => {
  const out = clean('alpha <!-- author note --> beta');
  assert.doesNotMatch(out, /author note/);
  assert.match(out, /alpha/);
  assert.match(out, /beta/);
});

// --- fuzz / property tests: highlighting must be tolerant of ANY input ---
const stripTags = (h: string): string => h.replace(/<[^>]*>/g, '');
const unescape = (h: string): string =>
  h.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const norm = (x: string): string => x.replace(/[`*]/g, ''); // markdown markers are consumed; ignore them
const balanced = (h: string, tag: string): boolean =>
  (h.match(new RegExp('<' + tag + '[ >]', 'g')) ?? []).length ===
  (h.match(new RegExp('</' + tag + '>', 'g')) ?? []).length;

const ATOMS = [
  'a',
  'B',
  '7',
  ' ',
  '`',
  '*',
  '<',
  '>',
  '&',
  '/',
  '.',
  '-',
  '_',
  ':',
  '(',
  ')',
  '\n',
  '→',
  '->',
  'AX_X',
  'STEP_Y',
  'H_Z',
  'sdd-task',
  'x.directive.xml',
  'LOGIC_SWITCH',
  '**',
  '``',
];
function randInput(): string {
  let s = '';
  const n = Math.floor(Math.random() * 26);
  for (let i = 0; i < n; i++) s += ATOMS[Math.floor(Math.random() * ATOMS.length)];
  return s;
}

function assertInvariants(s: string): void {
  let h = '';
  assert.doesNotThrow(
    () => {
      h = renderInline(s);
    },
    `threw on ${JSON.stringify(s)}`
  );
  const noTags = stripTags(h);
  assert.ok(!/[<>]/.test(noTags), `raw <> leaked for ${JSON.stringify(s)} -> ${h}`);
  for (const tag of ['span', 'code', 'strong'])
    assert.ok(balanced(h, tag), `unbalanced <${tag}> for ${JSON.stringify(s)} -> ${h}`);
  assert.equal(
    norm(unescape(noTags)),
    norm(s),
    `text changed for ${JSON.stringify(s)} -> ${JSON.stringify(unescape(noTags))}`
  );
}

test('fuzz: renderInline holds invariants on 2000 random inputs', () => {
  for (let i = 0; i < 2000; i++) assertInvariants(randInput());
});

test('fuzz: adversarial fixed cases', () => {
  for (const s of [
    '',
    '`',
    '``',
    '```',
    'a`b',
    'a``b',
    '`a``b`',
    '**',
    '*** x ***',
    '<script>',
    '<>&',
    'AX_<b>',
    '`<!--x-->`',
    'sdd-task`',
    'x.directive.xml.directive.xml',
    '→->`*`<',
    '`'.repeat(9),
    '**`AX_X`**',
  ]) {
    assertInvariants(s);
  }
});

test('fuzz: renderMarkdown (block) keeps word-chars + escapes + balances on 1500 random inputs', () => {
  const words = (x: string): string => (x.match(/[A-Za-z0-9_]+/g) ?? []).join('');
  for (let i = 0; i < 1500; i++) {
    const s = randInput();
    let h = '';
    assert.doesNotThrow(
      () => {
        h = renderMarkdown(s);
      },
      `threw on ${JSON.stringify(s)}`
    );
    const noTags = stripTags(h);
    assert.ok(!/[<>]/.test(noTags), `raw <> leaked for ${JSON.stringify(s)} -> ${h}`);
    for (const tag of ['span', 'code', 'strong', 'p', 'ul', 'li'])
      assert.ok(balanced(h, tag), `unbalanced <${tag}> for ${JSON.stringify(s)}`);
    assert.equal(words(unescape(noTags)), words(s), `word-chars changed for ${JSON.stringify(s)}`);
  }
});

test('clean → renderMarkdown: SECTION marker survives end-to-end (regression)', () => {
  const src =
    'Run `sdd-migrate anchors --all --write` (wraps sections in `<!--SECTION:-->` markers). Verify with `sdd-check`.';
  const h = renderMarkdown(clean(src));
  assert.match(h, /<code>&lt;!--SECTION:--&gt;<\/code>/);
  assert.match(h, /Verify with/);
  // sdd-check stays its own code span, not swallowed into a broken span
  assert.match(h, /<code><span class="tok-cmd">sdd-check<\/span><\/code>/);
});
