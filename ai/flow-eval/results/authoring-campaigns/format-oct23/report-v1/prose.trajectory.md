# Authoring trajectory baseline

Source: 5a30ee51ab9e360e9c025e9cf3af89e4b690106a; model: llm-proxy/deepseek-v4-flash. Recorded 1/6.

Baseline only — no prompt, speed or quality improvement is claimed.

| Case | Saved/planned | Artifact | Semantic | Joint | Path proven | Tools median | Reads | Writes/edits | Bash | Repeated reads | Worker tokens* | Worker messages | Worker seconds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| module-flat | 1/3 | 1 | 1 | 1 | 0 | 34 | 13 | 2 | 19 | 0 | 70203 (1/3) | 27 | 148.2 |
| module-nested | 0/3 | 0 | 0 | 0 | 0 | unknown | unknown | unknown | unknown | unknown | unknown (0/3) | unknown | unknown |

*Non-cache tokens. Per-role input/output/reasoning/cache counters are in report.json. Cost and provider HTTP retries are unknown.

- A baseline only: no optimization or causal speedup has been demonstrated.
- Artifact, semantic and path verdicts are separate; opaque Bash is not proof of a forbidden write.
- Read/write counts are attempts, not bytes read or filesystem changes. An observed repeat is not necessarily waste.
- Token totals exclude cache reads; cache counters and model messages are separate in per-role profiles.
- SDK REST requests include polling and are not provider HTTP calls; proxy retries and monetary cost are unknown.
- Three repetitions describe these synthetic artifact cases, not statistical equivalence or the complete interactive SDD flow.

## authoring-format-oct23-module-flat-prose-r1

Artifact=true; semantic=pass; path=false; status=completed.

Failed artifact checks: none. Path detail: opaque Bash command: whole-write-only path unproven.

Binding/capture/cleanup issues: none. SDK REST measurement requests (including polling): unknown.

Categories below describe observable actions, not private reasoning or proven necessity. Read/write rows are attempts; status/exit retain failures. Withheld shell payloads remain unknown, never guessed.

| Order | Tool | Observable role (not intent) | Category | Path / sanitized command | Status | Exit | Issues |
|---:|---|---|---|---|---|---:|---|
| 0 | read | Load declared task facts | reference | inputs/brief.md | completed | unknown |  |
| 1 | read | Load workflow/instruction source | directive | ai/directives/sdd-v2/module.directive.xml | completed | unknown |  |
| 2 | bash | Invoke canonical creation | create | npx --no-install gennady sdd-new module --scope token --module normalize | completed | 0 |  |
| 3 | read | Read current target (skeleton or result) | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 4 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 5 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-inventory-format.xml | completed | unknown |  |
| 6 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-surface-format.xml | completed | unknown |  |
| 7 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/dbc-contracts.xml | completed | unknown |  |
| 8 | read | Read reference context; necessity not proven | reference | specs/token/token.spec.md | completed | unknown |  |
| 9 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/diagram-vocabulary.xml | completed | unknown |  |
| 10 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 1 | embedded-shell-payload-withheld |
| 11 | bash | Unclassified; see safe command/raw trace | unknown | ls ai/directives/coding ai/directives/testing; ls ai/directives/architecture | completed | 0 | opaque-shell |
| 12 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/module-spec-structure.xml | completed | unknown |  |
| 13 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 14 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/requirement-entry-format.xml | completed | unknown |  |
| 15 | bash | Unclassified; see safe command/raw trace | unknown | find specs -type f -name '*.spec.md' -maxdepth 4; rg -n "acronym ACR" ai/directives/sdd-v2/formats/*.xml   head -40 | completed | 0 | opaque-shell |
| 16 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/module-tasks-index.xml | completed | unknown |  |
| 17 | read | Read reference context; necessity not proven | reference | specs/infra-base/infra-base.spec.md | completed | unknown |  |
| 18 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 19 | bash | Unclassified; see safe command/raw trace | unknown | rg -n "DECISION_LOG_ENTRY_FORMAT" ai/directives/sdd-v2/root.directive.xml; sed -n '500,540p' ai/directives/sdd-v2/root.directive.xml | completed | 0 | opaque-shell |
| 20 | bash | Unclassified; see safe command/raw trace | unknown | rg -n "sdd-check --spec --authoring authoring diagnostics authoring check" ai/directives/sdd-v2 --glob '*.xml'   head -60 | completed | 0 | opaque-shell |
| 21 | bash | Unclassified; see safe command/raw trace | unknown | rg -n "REQ-1" docs .claude ai --glob '*.md' --glob '*.xml'   rg -v "sdd-v2/formats node_modules"   head -40; find docs -type f   head -30 | completed | 0 | opaque-shell |
| 22 | read | Read reference context; necessity not proven | reference | docs/token-contract.md | completed | unknown |  |
| 23 | bash | Unclassified; see safe command/raw trace | unknown | sed -n '1,40p' ai/directives/testing/node-test.xml; sed -n '1,25p' ai/directives/coding/typescript-rules.xml | completed | 0 | opaque-shell |
| 24 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 25 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 26 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 27 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 28 | bash | Unclassified; see safe command/raw trace | unknown | rg -n "authoring-complete authoring_complete authoring boundary" ai/directives docs .claude --glob '*.xml' --glob '*.md'   head -60 | completed | 0 | opaque-shell |
| 29 | bash | Unclassified; see safe command/raw trace | unknown | git status --short; git diff --stat | completed | 0 | opaque-shell |
| 30 | bash | Unclassified; see safe command/raw trace | unknown | mkdir -p .tmp && cp specs/token/normalize/normalize.spec.md .tmp/normalize.spec.md.pre-log && npx --no-install gennady sdd-log specs/token/normalize/normalize.spec.md authoring-complete | completed | 0 | opaque-shell |
| 31 | bash | Unclassified; see safe command/raw trace | unknown | diff -u .tmp/normalize.spec.md.pre-log specs/token/normalize/normalize.spec.md    true; git status --short | completed | 0 | opaque-shell |
| 32 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 33 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |

Read attempts: inputs/brief.md ×1; ai/directives/sdd-v2/module.directive.xml ×1; specs/token/normalize/normalize.spec.md ×1; ai/directives/sdd-v2/formats/entity-inventory-format.xml ×1; ai/directives/sdd-v2/formats/entity-surface-format.xml ×1; ai/directives/sdd-v2/formats/dbc-contracts.xml ×1; specs/token/token.spec.md ×1; ai/directives/sdd-v2/formats/diagram-vocabulary.xml ×1; ai/directives/sdd-v2/formats/module-spec-structure.xml ×1; ai/directives/sdd-v2/formats/requirement-entry-format.xml ×1; ai/directives/sdd-v2/formats/module-tasks-index.xml ×1; specs/infra-base/infra-base.spec.md ×1; docs/token-contract.md ×1.

Temporal batching candidates: 0+1, 5+6, 6+7, 7+8, 8+9, 16+17. These are hypotheses, not guaranteed savings.

Reflection: completed; actual self-report is archived separately and is not a causal verdict.

## authoring-format-oct23-module-nested-prose-r1

MISSING — not silently excluded.

## authoring-format-oct23-module-flat-prose-r2

MISSING — not silently excluded.

## authoring-format-oct23-module-nested-prose-r2

MISSING — not silently excluded.

## authoring-format-oct23-module-flat-prose-r3

MISSING — not silently excluded.

## authoring-format-oct23-module-nested-prose-r3

MISSING — not silently excluded.
