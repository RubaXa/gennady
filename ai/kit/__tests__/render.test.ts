// @file: Indentation + templating tests for the kit Handlebars renderer.
// @consumers: node:test runner
// @tasks: ai-kit-templating

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { createRenderer, normalizeBrick, walk, UNIT, KIT, TEMPLATES } from "../render.ts";

/**
 * Fixtures authored in CANONICAL base-0 form (open tag col 0, body one UNIT deep, relative
 * nesting kept) so normalizeBrick() is a fixed point on them. The oracle is then independent:
 * a brick included at depth D must equal its canonical text shifted by D × UNIT — derived
 * mechanically, never hand-guessed per case.
 */
const FIXTURES: Record<string, string> = {
  // self-closing one-liner
  "fx/oneliner": `<Hook id="HOOK_ONE"/>`,
  // single body line
  "fx/simple": `<Axiom id="AX_SIMPLE">\n  One sentence body.\n</Axiom>`,
  // body with an internal blank line between paragraphs
  "fx/paragraphs": `<Axiom id="AX_PARA">\n  First paragraph.\n\n  Second paragraph after a blank line.\n</Axiom>`,
  // three-level nested bullet list
  "fx/nested-list": `<Axiom id="AX_LIST">\n  Intro line.\n  - level one\n    - level two\n      - level three\n</Axiom>`,
  // markdown table (pipes/dashes are content, not nesting)
  "fx/table": `<Contract id="CT_TABLE">\n  | Name | Type |\n  |------|------|\n  | a    | Port |\n</Contract>`,
  // code fence whose interior indentation is content and must survive verbatim
  "fx/code-fence": `<Pattern id="PT_CODE">\n  <Intent>Show a function.</Intent>\n  <Snippet>\n    \`\`\`ts\n    function f(x: number) {\n      return x + 1;\n    }\n    \`\`\`\n  </Snippet>\n  <Why>Indented fence body must survive.</Why>\n</Pattern>`,
  // body prose that itself contains XML-like tags (must NOT trigger any tag-aware reformat)
  "fx/tag-in-content": `<AntiPattern id="AP_TAGS">\n  <Bad>\`<button on:click={x}>\` plus a stray \`</div>\` in prose.</Bad>\n  <Good>\`<button onclick={x}>\`.</Good>\n</AntiPattern>`,
};

const { render } = createRenderer(FIXTURES);

/** Shift canonical brick text to depth D: prefix each non-blank line with D × UNIT. */
function shiftToDepth(text: string, depth: number): string {
  const pad = UNIT.repeat(depth);
  return text
    .split("\n")
    .map((l) => (l === "" ? "" : pad + l))
    .join("\n");
}

const stripTrailingNewlines = (s: string) => s.replace(/\n+$/, "");

describe("normalizeBrick — re-bases real extraction artifacts to canonical", () => {
  it("rebases body indented to 6 and close at 4 → body one UNIT, tags col 0", () => {
    const raw = "<!-- source: x -->\n<Axiom id=\"A\">\n      line one\n      line two\n    </Axiom>";
    assert.equal(normalizeBrick(raw), '<Axiom id="A">\n  line one\n  line two\n</Axiom>');
  });
  it("preserves relative nesting while re-basing", () => {
    const raw = "<Axiom id=\"A\">\n      intro\n        deeper\n    </Axiom>";
    assert.equal(normalizeBrick(raw), '<Axiom id="A">\n  intro\n    deeper\n</Axiom>');
  });
  it("canonical fixtures are fixed points", () => {
    for (const [name, raw] of Object.entries(FIXTURES)) {
      assert.equal(normalizeBrick(raw), raw, `fixture ${name} must already be canonical`);
    }
  });
  it("self-closing brick stays one line", () => {
    assert.equal(normalizeBrick("<Hook id=\"H\"/>"), '<Hook id="H"/>');
  });
});

describe("indent matrix — every fixture at every depth equals canonical shifted by depth", () => {
  const depths = [0, 1, 2, 3, 4];
  for (const [name, raw] of Object.entries(FIXTURES)) {
    for (const d of depths) {
      it(`${name} @ depth ${d}`, () => {
        const tpl = `${UNIT.repeat(d)}{{> "${name}"}}\n`;
        const out = stripTrailingNewlines(render(tpl));
        const expected = stripTrailingNewlines(shiftToDepth(raw, d));
        assert.equal(out, expected);
      });
    }
  }
});

describe("corpus — every real kit brick round-trips at an arbitrary depth", () => {
  it("all bricks: render(depth 1) === canonical shifted by 1", () => {
    const bricks = walk(KIT, (p) => p.endsWith(".xml") && !p.startsWith(TEMPLATES + "/"));
    const fails: string[] = [];
    for (const f of bricks) {
      const name = relative(KIT, f).replace(/\.xml$/, "");
      const canonical = normalizeBrick(readFileSync(f, "utf8"));
      const out = stripTrailingNewlines(render(`${UNIT}{{> "${name}"}}\n`));
      if (out !== stripTrailingNewlines(shiftToDepth(canonical, 1))) fails.push(name);
    }
    assert.equal(fails.length, 0, `bricks with broken indent: ${fails.slice(0, 20).join(", ")}`);
    assert.ok(bricks.length > 100, `expected a real corpus, got ${bricks.length} bricks`);
  });
});

describe("monster template — mixed depths, conditionals, loops, variables", () => {
  const monster = [
    `<Root version="{{version}}">`,
    `  <Mission>Generated for {{scope}}.</Mission>`,
    ``,
    `  <BeliefState>`,
    `    {{> "fx/simple"}}`,
    ``,
    `    {{> "fx/nested-list"}}`,
    `    {{#if withCode}}`,
    ``,
    `    {{> "fx/code-fence"}}`,
    `    {{/if}}`,
    `  </BeliefState>`,
    ``,
    `  <Deep>`,
    `    <Inner>`,
    `      {{> "fx/table"}}`,
    `    </Inner>`,
    `  </Deep>`,
    ``,
    `  <Patterns>`,
    `    {{#each patterns}}`,
    `    {{> (lookup this "p")}}`,
    `    {{/each}}`,
    `  </Patterns>`,
    `</Root>`,
    ``,
  ].join("\n");

  it("variables are substituted", () => {
    const out = render(monster, { version: "1.0", scope: "web", patterns: [] });
    assert.match(out, /<Root version="1\.0">/);
    assert.match(out, /Generated for web\./);
  });

  it("includes at depth 2 land at depth 2 (exact shifted block present)", () => {
    const out = render(monster, { version: "1.0", scope: "web", withCode: true, patterns: [] });
    assert.ok(out.includes(shiftToDepth(FIXTURES["fx/simple"], 2)), "fx/simple @ depth 2");
    assert.ok(out.includes(shiftToDepth(FIXTURES["fx/nested-list"], 2)), "fx/nested-list @ depth 2");
  });

  it("code fence interior survives verbatim at depth 2", () => {
    const out = render(monster, { version: "1.0", scope: "web", withCode: true, patterns: [] });
    assert.ok(out.includes(shiftToDepth(FIXTURES["fx/code-fence"], 2)), "fx/code-fence @ depth 2");
  });

  it("deeply nested include lands at depth 3", () => {
    const out = render(monster, { version: "1.0", scope: "web", patterns: [] });
    assert.ok(out.includes(shiftToDepth(FIXTURES["fx/table"], 3)), "fx/table @ depth 3");
  });

  it("conditional includes/excludes the block", () => {
    const on = render(monster, { version: "1.0", scope: "web", withCode: true, patterns: [] });
    const off = render(monster, { version: "1.0", scope: "web", withCode: false, patterns: [] });
    assert.ok(on.includes("PT_CODE"), "withCode:true includes PT_CODE");
    assert.ok(!off.includes("PT_CODE"), "withCode:false omits PT_CODE");
  });

  it("each loop renders one correctly-indented block per item", () => {
    const out = render(monster, {
      version: "1.0",
      scope: "web",
      patterns: [{ p: "fx/table" }, { p: "fx/tag-in-content" }],
    });
    assert.ok(out.includes(shiftToDepth(FIXTURES["fx/table"], 2)), "loop item fx/table @ depth 2");
    assert.ok(out.includes(shiftToDepth(FIXTURES["fx/tag-in-content"], 2)), "loop item fx/tag-in-content @ depth 2");
  });

  it("no line is over-indented to an odd offset (all leading indent is a multiple of UNIT)", () => {
    const out = render(monster, {
      version: "1.0",
      scope: "web",
      withCode: true,
      patterns: [{ p: "fx/table" }],
    });
    for (const line of out.split("\n")) {
      const lead = line.match(/^ */)![0].length;
      assert.equal(lead % UNIT.length, 0, `line has non-multiple indent (${lead}): ${JSON.stringify(line)}`);
    }
  });
});
