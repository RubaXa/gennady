# Authoring trajectory baseline

Source: c80a7e465b348d2b5624740264b927da1a4962d7; model: llm-proxy/deepseek-v4-flash. Recorded 1/6.

Baseline only — no prompt, speed or quality improvement is claimed.

| Case | Saved/planned | Artifact | Semantic | Joint | Path proven | Tools median | Reads | Writes/edits | Bash | Repeated reads | Worker tokens* | Worker messages | Worker seconds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| module-flat | 1/3 | 0 | 0 | 0 | 0 | 29 | 13 | 2 | 14 | 1 | unknown (0/3) | unknown | unknown |
| module-nested | 0/3 | 0 | 0 | 0 | 0 | unknown | unknown | unknown | unknown | unknown | unknown (0/3) | unknown | unknown |

*Non-cache tokens. Per-role input/output/reasoning/cache counters are in report.json. Cost and provider HTTP retries are unknown.

- A baseline only: no optimization or causal speedup has been demonstrated.
- Artifact, semantic and path verdicts are separate; opaque Bash is not proof of a forbidden write.
- Read/write counts are attempts, not bytes read or filesystem changes. An observed repeat is not necessarily waste.
- Token totals exclude cache reads; cache counters and model messages are separate in per-role profiles.
- SDK REST requests include polling and are not provider HTTP calls; proxy retries and monetary cost are unknown.
- Three repetitions describe these synthetic artifact cases, not statistical equivalence or the complete interactive SDD flow.

## authoring-format-oct23-module-flat-observation-r1

Artifact=false; semantic=interrupted; path=false; status=interrupted.

Failed artifact checks: none. Path detail: interrupted path; retained for diagnosis only.

Binding/capture/cleanup issues: source-model-or-scenario-binding, cleanup-unproven. SDK REST measurement requests (including polling): unknown.

Categories below describe observable actions, not private reasoning or proven necessity. Read/write rows are attempts; status/exit retain failures. Withheld shell payloads remain unknown, never guessed.

| Order | Tool | Observable role (not intent) | Category | Path / sanitized command | Status | Exit | Issues |
|---:|---|---|---|---|---|---:|---|
| 0 | read | Load declared task facts | reference | inputs/brief.md | completed | unknown |  |
| 1 | read | Load workflow/instruction source | directive | ai/directives/sdd-v2/module.directive.xml | completed | unknown |  |
| 2 | bash | Invoke canonical creation | create | npx --no-install gennady sdd-new module --scope token --module normalize | completed | 0 |  |
| 3 | read | Read current target (skeleton or result) | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 4 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 5 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 6 | read | Read reference context; necessity not proven | reference | specs/token/token.spec.md | completed | unknown |  |
| 7 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-inventory-format.xml | completed | unknown |  |
| 8 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-surface-format.xml | completed | unknown |  |
| 9 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/dbc-contracts.xml | completed | unknown |  |
| 10 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/diagram-vocabulary.xml | completed | unknown |  |
| 11 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/module-spec-structure.xml | completed | unknown |  |
| 12 | bash | Inspect available paths/state | discovery | npx --no-install gennady sdd-orient specs/token/normalize/normalize.spec.md | completed | 0 |  |
| 13 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 14 | read | Read reference context; necessity not proven | reference | specs/infra-base/infra-base.spec.md | completed | unknown |  |
| 15 | read | Read reference context; necessity not proven | reference | docs/token-contract.md | completed | unknown |  |
| 16 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/requirement-entry-format.xml | completed | unknown |  |
| 17 | bash | Unclassified; see safe command/raw trace | unknown | rg -n "ACR acronym SPEC_ID REQ-" ai/directives/sdd-v2/formats ai/directives/sdd-v2/*.xml   head -100 | completed | 0 | opaque-shell |
| 18 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 19 | bash | Unclassified; see safe command/raw trace | unknown | rg -n "SPEC_ID SPEC-ID acronym" ai/directives/sdd-v2/module.directive.xml ai/directives/sdd-v2/root.directive.xml ai/directives/sdd-v2/formats/*.xml   head -60 | completed | 0 | opaque-shell |
| 20 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 21 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 22 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 23 | bash | Unclassified; see safe command/raw trace | unknown | cat .claude/skills/sdd-check/SKILL.md | completed | 0 | unrecognized-command |
| 24 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 25 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 26 | read | Read current target (skeleton or result) | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 27 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 28 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |

Read attempts: inputs/brief.md ×1; ai/directives/sdd-v2/module.directive.xml ×1; specs/token/normalize/normalize.spec.md ×2; specs/token/token.spec.md ×1; ai/directives/sdd-v2/formats/entity-inventory-format.xml ×1; ai/directives/sdd-v2/formats/entity-surface-format.xml ×1; ai/directives/sdd-v2/formats/dbc-contracts.xml ×1; ai/directives/sdd-v2/formats/diagram-vocabulary.xml ×1; ai/directives/sdd-v2/formats/module-spec-structure.xml ×1; specs/infra-base/infra-base.spec.md ×1; docs/token-contract.md ×1; ai/directives/sdd-v2/formats/requirement-entry-format.xml ×1.

Temporal batching candidates: 0+1, 6+7, 7+8, 8+9, 9+10, 10+11, 14+15, 15+16. These are hypotheses, not guaranteed savings.

Reflection: absent; actual self-report is archived separately and is not a causal verdict.

## authoring-format-oct23-module-nested-observation-r1

MISSING — not silently excluded.

## authoring-format-oct23-module-flat-observation-r2

MISSING — not silently excluded.

## authoring-format-oct23-module-nested-observation-r2

MISSING — not silently excluded.

## authoring-format-oct23-module-flat-observation-r3

MISSING — not silently excluded.

## authoring-format-oct23-module-nested-observation-r3

MISSING — not silently excluded.
