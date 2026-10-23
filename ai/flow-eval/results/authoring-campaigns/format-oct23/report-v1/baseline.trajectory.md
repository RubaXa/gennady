# Authoring trajectory baseline

Source: 9adf5e6617fa7a7e7fa0dd083640b310245d2340; model: llm-proxy/deepseek-v4-flash. Recorded 1/6.

Baseline only — no prompt, speed or quality improvement is claimed.

| Case | Saved/planned | Artifact | Semantic | Joint | Path proven | Tools median | Reads | Writes/edits | Bash | Repeated reads | Worker tokens* | Worker messages | Worker seconds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| module-flat | 1/3 | 0 | 0 | 0 | 0 | 23 | 10 | 2 | 11 | 0 | 49336 (1/3) | 16 | 83.9 |
| module-nested | 0/3 | 0 | 0 | 0 | 0 | unknown | unknown | unknown | unknown | unknown | unknown (0/3) | unknown | unknown |

*Non-cache tokens. Per-role input/output/reasoning/cache counters are in report.json. Cost and provider HTTP retries are unknown.

- A baseline only: no optimization or causal speedup has been demonstrated.
- Artifact, semantic and path verdicts are separate; opaque Bash is not proof of a forbidden write.
- Read/write counts are attempts, not bytes read or filesystem changes. An observed repeat is not necessarily waste.
- Token totals exclude cache reads; cache counters and model messages are separate in per-role profiles.
- SDK REST requests include polling and are not provider HTTP calls; proxy retries and monetary cost are unknown.
- Three repetitions describe these synthetic artifact cases, not statistical equivalence or the complete interactive SDD flow.

## authoring-format-oct23-module-flat-baseline-r1

Artifact=false; semantic=inconclusive; path=false; status=completed.

Failed artifact checks: pending-approval. Path detail: opaque Bash command: whole-write-only path unproven.

Binding/capture/cleanup issues: none. SDK REST measurement requests (including polling): unknown.

Categories below describe observable actions, not private reasoning or proven necessity. Read/write rows are attempts; status/exit retain failures. Withheld shell payloads remain unknown, never guessed.

| Order | Tool | Observable role (not intent) | Category | Path / sanitized command | Status | Exit | Issues |
|---:|---|---|---|---|---|---:|---|
| 0 | read | Load declared task facts | reference | inputs/brief.md | completed | unknown |  |
| 1 | read | Load workflow/instruction source | directive | ai/directives/sdd-v2/module.directive.xml | completed | unknown |  |
| 2 | bash | Invoke canonical creation | create | npx --no-install gennady sdd-new module --scope token --module normalize | completed | 0 |  |
| 3 | read | Read current target (skeleton or result) | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 4 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 5 | bash | Unclassified; see safe command/raw trace | unknown | ls -R specs   head -100 | completed | 0 | opaque-shell |
| 6 | read | Read reference context; necessity not proven | reference | specs/token/token.spec.md | completed | unknown |  |
| 7 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-inventory-format.xml | completed | unknown |  |
| 8 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-surface-format.xml | completed | unknown |  |
| 9 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/dbc-contracts.xml | completed | unknown |  |
| 10 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/module-spec-structure.xml | completed | unknown |  |
| 11 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/requirement-entry-format.xml | completed | unknown |  |
| 12 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/diagram-vocabulary.xml | completed | unknown |  |
| 13 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 14 | bash | Unclassified; see safe command/raw trace | unknown | git status --porcelain; git log --oneline -5 | completed | 0 | opaque-shell |
| 15 | bash | Unclassified; see safe command/raw trace | unknown | cat package.json | completed | 0 | unrecognized-command |
| 16 | bash | Unclassified; see safe command/raw trace | unknown | grep -rl "DECISION_LOG_ENTRY_FORMAT" ai/directives   head -20 | completed | 0 | opaque-shell |
| 17 | bash | Unclassified; see safe command/raw trace | unknown | grep -n -A30 "id=\"DECISION_LOG_ENTRY_FORMAT\"" ai/directives/sdd-v2/*.xml ai/directives/sdd-v2/formats/*.xml   head -80 | completed | 0 | opaque-shell |
| 18 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 19 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 20 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 21 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 22 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |

Read attempts: inputs/brief.md ×1; ai/directives/sdd-v2/module.directive.xml ×1; specs/token/normalize/normalize.spec.md ×1; specs/token/token.spec.md ×1; ai/directives/sdd-v2/formats/entity-inventory-format.xml ×1; ai/directives/sdd-v2/formats/entity-surface-format.xml ×1; ai/directives/sdd-v2/formats/dbc-contracts.xml ×1; ai/directives/sdd-v2/formats/module-spec-structure.xml ×1; ai/directives/sdd-v2/formats/requirement-entry-format.xml ×1; ai/directives/sdd-v2/formats/diagram-vocabulary.xml ×1.

Temporal batching candidates: 0+1, 6+7, 7+8, 8+9, 9+10, 10+11, 11+12. These are hypotheses, not guaranteed savings.

Reflection: completed; actual self-report is archived separately and is not a causal verdict.

## authoring-format-oct23-module-nested-baseline-r1

MISSING — not silently excluded.

## authoring-format-oct23-module-flat-baseline-r2

MISSING — not silently excluded.

## authoring-format-oct23-module-nested-baseline-r2

MISSING — not silently excluded.

## authoring-format-oct23-module-flat-baseline-r3

MISSING — not silently excluded.

## authoring-format-oct23-module-nested-baseline-r3

MISSING — not silently excluded.
