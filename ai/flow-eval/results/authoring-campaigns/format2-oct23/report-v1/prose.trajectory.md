# Authoring trajectory baseline

Source: d7435fac581043d29a493e45d5539a3fb0bf20e9; model: llm-proxy/deepseek-v4-flash. Recorded 6/6.

Baseline only — no prompt, speed or quality improvement is claimed.

| Case | Saved/planned | Artifact | Semantic | Joint | Path proven | Tools median | Reads | Writes/edits | Bash | Repeated reads | Worker tokens* | Worker messages | Worker seconds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| module-flat | 3/3 | 2 | 2 | 2 | 0 | 28 | 14 | 3 | 12 | 1 | 57165 (3/3) | 20 | 112.7 |
| module-nested | 3/3 | 2 | 0 | 0 | 0 | 30 | 13 | 2 | 12 | 1 | 56702 (3/3) | 21 | 104.8 |

*Non-cache tokens. Per-role input/output/reasoning/cache counters are in report.json. Cost and provider HTTP retries are unknown.

- A baseline only: no optimization or causal speedup has been demonstrated.
- Artifact, semantic and path verdicts are separate; opaque Bash is not proof of a forbidden write.
- Read/write counts are attempts, not bytes read or filesystem changes. An observed repeat is not necessarily waste.
- Token totals exclude cache reads; cache counters and model messages are separate in per-role profiles.
- SDK REST requests include polling and are not provider HTTP calls; proxy retries and monetary cost are unknown.
- Three repetitions describe these synthetic artifact cases, not statistical equivalence or the complete interactive SDD flow.

## authoring-format2-oct23-module-flat-prose-r1

Artifact=true; semantic=pass; path=false; status=completed.

Failed artifact checks: none. Path detail: opaque Bash command: whole-write-only path unproven; successful target check after final Write not proven.

Binding/capture/cleanup issues: none. SDK REST measurement requests (including polling): unknown.

Categories below describe observable actions, not private reasoning or proven necessity. Read/write rows are attempts; status/exit retain failures. Withheld shell payloads remain unknown, never guessed.

| Order | Tool | Observable role (not intent) | Category | Path / sanitized command | Status | Exit | Issues |
|---:|---|---|---|---|---|---:|---|
| 0 | read | Load declared task facts | reference | inputs/brief.md | completed | unknown |  |
| 1 | read | Load workflow/instruction source | directive | ai/directives/sdd-v2/module.directive.xml | completed | unknown |  |
| 2 | bash | Invoke canonical creation | create | npx --no-install gennady sdd-new module --scope token --module normalize | completed | 0 |  |
| 3 | read | Read current target (skeleton or result) | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 4 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 5 | read | Read reference context; necessity not proven | reference | specs/token/token.spec.md | completed | unknown |  |
| 6 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-inventory-format.xml | completed | unknown |  |
| 7 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-surface-format.xml | completed | unknown |  |
| 8 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/dbc-contracts.xml | completed | unknown |  |
| 9 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/diagram-vocabulary.xml | completed | unknown |  |
| 10 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/module-spec-structure.xml | completed | unknown |  |
| 11 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/requirement-entry-format.xml | completed | unknown |  |
| 12 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 13 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 14 | read | Read reference context; necessity not proven | reference | docs/token-contract.md | completed | unknown |  |
| 15 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 16 | bash | Unclassified; see safe command/raw trace | unknown | grep -rn "normalize-example\ empty-input-rejection\ MODULE_REQUIREMENTS" --exclude-dir=node_modules --exclude-dir=.git .   head -50 | completed | 0 | opaque-shell |
| 17 | bash | Unclassified; see safe command/raw trace | unknown | grep -rn "acronym\ ACR" ai/directives/sdd-v2 --include=*.xml   head -60 | completed | 0 | opaque-shell |
| 18 | bash | Unclassified; see safe command/raw trace | unknown | grep -rn "acronym\ ACR" ai/directives/sdd-v2   head -80 | completed | 0 | opaque-shell |
| 19 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 20 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 21 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 22 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 23 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 24 | bash | Unclassified; see safe command/raw trace | unknown | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring && git status --porcelain | completed | 0 | opaque-shell |

Read attempts: inputs/brief.md ×1; ai/directives/sdd-v2/module.directive.xml ×1; specs/token/normalize/normalize.spec.md ×1; specs/token/token.spec.md ×1; ai/directives/sdd-v2/formats/entity-inventory-format.xml ×1; ai/directives/sdd-v2/formats/entity-surface-format.xml ×1; ai/directives/sdd-v2/formats/dbc-contracts.xml ×1; ai/directives/sdd-v2/formats/diagram-vocabulary.xml ×1; ai/directives/sdd-v2/formats/module-spec-structure.xml ×1; ai/directives/sdd-v2/formats/requirement-entry-format.xml ×1; docs/token-contract.md ×1.

Temporal batching candidates: 0+1, 5+6, 6+7, 7+8, 8+9, 9+10. These are hypotheses, not guaranteed savings.

Reflection: completed; actual self-report is archived separately and is not a causal verdict.

## authoring-format2-oct23-module-nested-prose-r1

Artifact=true; semantic=fail; path=false; status=completed.

Failed artifact checks: none. Path detail: opaque Bash command: whole-write-only path unproven.

Binding/capture/cleanup issues: none. SDK REST measurement requests (including polling): unknown.

Categories below describe observable actions, not private reasoning or proven necessity. Read/write rows are attempts; status/exit retain failures. Withheld shell payloads remain unknown, never guessed.

| Order | Tool | Observable role (not intent) | Category | Path / sanitized command | Status | Exit | Issues |
|---:|---|---|---|---|---|---:|---|
| 0 | read | Load declared task facts | reference | inputs/brief.md | completed | unknown |  |
| 1 | read | Load workflow/instruction source | directive | ai/directives/sdd-v2/module.directive.xml | completed | unknown |  |
| 2 | bash | Invoke canonical creation | create | npx --no-install gennady sdd-new module --scope token --module pipeline/normalize | completed | 0 |  |
| 3 | read | Read current target (skeleton or result) | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 4 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 5 | read | Read reference context; necessity not proven | reference | specs/token/token.spec.md | completed | unknown |  |
| 6 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-inventory-format.xml | completed | unknown |  |
| 7 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-surface-format.xml | completed | unknown |  |
| 8 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/dbc-contracts.xml | completed | unknown |  |
| 9 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/diagram-vocabulary.xml | completed | unknown |  |
| 10 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/requirement-entry-format.xml | completed | unknown |  |
| 11 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/module-spec-structure.xml | completed | unknown |  |
| 12 | bash | Unclassified; see safe command/raw trace | unknown | rg -n "module acronym MODULE_REQUIREMENTS ACR.*module spec acronym" ai specs README.md   head -40 | completed | 0 | opaque-shell |
| 13 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 14 | write | Whole-file write attempt | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 15 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 16 | write | Whole-file write attempt | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 17 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 18 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |

Read attempts: inputs/brief.md ×1; ai/directives/sdd-v2/module.directive.xml ×1; specs/token/pipeline/normalize/normalize.spec.md ×1; specs/token/token.spec.md ×1; ai/directives/sdd-v2/formats/entity-inventory-format.xml ×1; ai/directives/sdd-v2/formats/entity-surface-format.xml ×1; ai/directives/sdd-v2/formats/dbc-contracts.xml ×1; ai/directives/sdd-v2/formats/diagram-vocabulary.xml ×1; ai/directives/sdd-v2/formats/requirement-entry-format.xml ×1; ai/directives/sdd-v2/formats/module-spec-structure.xml ×1.

Temporal batching candidates: 0+1, 5+6, 6+7, 7+8, 8+9, 9+10, 10+11. These are hypotheses, not guaranteed savings.

Reflection: completed; actual self-report is archived separately and is not a causal verdict.

## authoring-format2-oct23-module-flat-prose-r2

Artifact=false; semantic=fail; path=false; status=completed.

Failed artifact checks: pending-approval. Path detail: opaque Bash command: whole-write-only path unproven; actual create→target read→whole Write order not proven.

Binding/capture/cleanup issues: none. SDK REST measurement requests (including polling): unknown.

Categories below describe observable actions, not private reasoning or proven necessity. Read/write rows are attempts; status/exit retain failures. Withheld shell payloads remain unknown, never guessed.

| Order | Tool | Observable role (not intent) | Category | Path / sanitized command | Status | Exit | Issues |
|---:|---|---|---|---|---|---:|---|
| 0 | read | Load declared task facts | reference | inputs/brief.md | completed | unknown |  |
| 1 | read | Load workflow/instruction source | directive | ai/directives/sdd-v2/module.directive.xml | completed | unknown |  |
| 2 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 3 | bash | Unclassified; see safe command/raw trace | unknown | ls -la specs/token && npx --no-install gennady sdd-new module --scope token --module normalize | completed | 0 | opaque-shell |
| 4 | read | Read current target (skeleton or result) | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 5 | read | Read reference context; necessity not proven | reference | specs/token/token.spec.md | completed | unknown |  |
| 6 | bash | Unclassified; see safe command/raw trace | unknown | ls ai/directives/sdd-v2/formats/ && ls specs/infra-base | completed | 0 | opaque-shell |
| 7 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-inventory-format.xml | completed | unknown |  |
| 8 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-surface-format.xml | completed | unknown |  |
| 9 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/dbc-contracts.xml | completed | unknown |  |
| 10 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/diagram-vocabulary.xml | completed | unknown |  |
| 11 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/requirement-entry-format.xml | completed | unknown |  |
| 12 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/module-spec-structure.xml | completed | unknown |  |
| 13 | bash | Unclassified; see safe command/raw trace | unknown | ls -R docs   head -50 | completed | 0 | opaque-shell |
| 14 | bash | Unclassified; see safe command/raw trace | unknown | find specs/infra-base -type f -maxdepth 3 -print && ls ai/directives/sdd-v2   head -40 | completed | 0 | opaque-shell |
| 15 | read | Read reference context; necessity not proven | reference | docs/token-contract.md | completed | unknown |  |
| 16 | read | Read reference context; necessity not proven | reference | specs/infra-base/infra-base.spec.md | completed | unknown |  |
| 17 | bash | Unclassified; see safe command/raw trace | unknown | rg -n "[A-Z][A-Z0-9-]*-REQ-" ai docs specs --glob '*.md' --glob '*.xml'   head -60 | completed | 0 | opaque-shell |
| 18 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/module-diagram-ladder.example.md | completed | unknown |  |
| 19 | bash | Unclassified; see safe command/raw trace | unknown | rg -n "acronym акроним SPEC_ID spec id" ai/directives/sdd-v2 specs --glob '*.xml' --glob '*.md'   head -80 | completed | 0 | opaque-shell |
| 20 | bash | Unclassified; see safe command/raw trace | unknown | cat package.json && find . -maxdepth 2 -name 'tsconfig*' -o -maxdepth 2 -name '*.config.*'   grep -v node_modules | completed | 1 | opaque-shell |
| 21 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 22 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 23 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 24 | bash | Unclassified; see safe command/raw trace | unknown | sed -i '' 's/NORM-REQ/NOR-REQ/g; s/NORM-DL/NOR-DL/g' specs/token/normalize/normalize.spec.md | completed | 0 | opaque-shell |
| 25 | read | Read current target (skeleton or result) | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 26 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 27 | bash | Unclassified; see safe command/raw trace | unknown | git status --short && git diff --stat | completed | 0 | opaque-shell |

Read attempts: inputs/brief.md ×1; ai/directives/sdd-v2/module.directive.xml ×1; specs/token/normalize/normalize.spec.md ×2; specs/token/token.spec.md ×1; ai/directives/sdd-v2/formats/entity-inventory-format.xml ×1; ai/directives/sdd-v2/formats/entity-surface-format.xml ×1; ai/directives/sdd-v2/formats/dbc-contracts.xml ×1; ai/directives/sdd-v2/formats/diagram-vocabulary.xml ×1; ai/directives/sdd-v2/formats/requirement-entry-format.xml ×1; ai/directives/sdd-v2/formats/module-spec-structure.xml ×1; docs/token-contract.md ×1; specs/infra-base/infra-base.spec.md ×1; ai/directives/sdd-v2/formats/module-diagram-ladder.example.md ×1.

Temporal batching candidates: 0+1, 4+5, 7+8, 8+9, 9+10, 10+11, 11+12, 15+16. These are hypotheses, not guaranteed savings.

Reflection: completed; actual self-report is archived separately and is not a causal verdict.

## authoring-format2-oct23-module-nested-prose-r2

Artifact=true; semantic=fail; path=false; status=completed.

Failed artifact checks: none. Path detail: opaque Bash command: whole-write-only path unproven.

Binding/capture/cleanup issues: none. SDK REST measurement requests (including polling): unknown.

Categories below describe observable actions, not private reasoning or proven necessity. Read/write rows are attempts; status/exit retain failures. Withheld shell payloads remain unknown, never guessed.

| Order | Tool | Observable role (not intent) | Category | Path / sanitized command | Status | Exit | Issues |
|---:|---|---|---|---|---|---:|---|
| 0 | read | Load declared task facts | reference | inputs/brief.md | completed | unknown |  |
| 1 | read | Load workflow/instruction source | directive | ai/directives/sdd-v2/module.directive.xml | completed | unknown |  |
| 2 | bash | Invoke canonical creation | create | npx --no-install gennady sdd-new module --scope token --module pipeline/normalize | completed | 0 |  |
| 3 | read | Read current target (skeleton or result) | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 4 | bash | Unclassified; see safe command/raw trace | unknown | ls -R specs ai/directives/sdd-v2/formats   head -100 | completed | 0 | opaque-shell |
| 5 | read | Read reference context; necessity not proven | reference | specs/token/token.spec.md | completed | unknown |  |
| 6 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-inventory-format.xml | completed | unknown |  |
| 7 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-surface-format.xml | completed | unknown |  |
| 8 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/dbc-contracts.xml | completed | unknown |  |
| 9 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/diagram-vocabulary.xml | completed | unknown |  |
| 10 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/module-spec-structure.xml | completed | unknown |  |
| 11 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/requirement-entry-format.xml | completed | unknown |  |
| 12 | bash | Unclassified; see safe command/raw trace | unknown | grep -rl "DECISION_LOG_ENTRY_FORMAT" ai/directives/sdd-v2   head | completed | 0 | opaque-shell |
| 13 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 14 | bash | Unclassified; see safe command/raw trace | unknown | grep -n -A40 "DECISION_LOG_ENTRY_FORMAT" ai/directives/sdd-v2/compression.directive.xml | completed | 0 | opaque-shell |
| 15 | bash | Unclassified; see safe command/raw trace | unknown | grep -rn "SPEC_ID" -A3 specs   head -40; grep -rn "### [A-Z]*-REQ" specs   head -30 | completed | 0 | opaque-shell |
| 16 | bash | Unclassified; see safe command/raw trace | unknown | grep -rn "acronym" ai/directives/sdd-v2   head -40 | completed | 0 | opaque-shell |
| 17 | read | Read reference context; necessity not proven | reference | specs/infra-base/infra-base.spec.md | completed | unknown |  |
| 18 | bash | Unclassified; see safe command/raw trace | unknown | ls -la; find . -maxdepth 2 -name 'package.json' -o -maxdepth 2 -name 'tsconfig.json'   head | completed | 0 | opaque-shell |
| 19 | read | Read reference context; necessity not proven | reference | package.json | completed | unknown |  |
| 20 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 21 | write | Whole-file write attempt | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 22 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 23 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 24 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 25 | bash | Unclassified; see safe command/raw trace | unknown | grep -rn "authoring-complete" ai specs docs   head -30 | completed | 0 | opaque-shell |
| 26 | bash | Unclassified; see safe command/raw trace | unknown | npx --no-install gennady sdd-log specs/token/pipeline/normalize/normalize.spec.md authoring-complete | completed | 0 | unclassified-tool-or-verb |
| 27 | read | Read current target (skeleton or result) | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 28 | bash | Unclassified; see safe command/raw trace | unknown | git status --porcelain | completed | 0 | unrecognized-command |
| 29 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 30 | write | Whole-file write attempt | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 31 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 32 | bash | Unclassified; see safe command/raw trace | unknown | npx --no-install gennady sdd-log specs/token/pipeline/normalize/normalize.spec.md authoring-complete | completed | 0 | unclassified-tool-or-verb |
| 33 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 34 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |

Read attempts: inputs/brief.md ×1; ai/directives/sdd-v2/module.directive.xml ×1; specs/token/pipeline/normalize/normalize.spec.md ×2; specs/token/token.spec.md ×1; ai/directives/sdd-v2/formats/entity-inventory-format.xml ×1; ai/directives/sdd-v2/formats/entity-surface-format.xml ×1; ai/directives/sdd-v2/formats/dbc-contracts.xml ×1; ai/directives/sdd-v2/formats/diagram-vocabulary.xml ×1; ai/directives/sdd-v2/formats/module-spec-structure.xml ×1; ai/directives/sdd-v2/formats/requirement-entry-format.xml ×1; specs/infra-base/infra-base.spec.md ×1; package.json ×1.

Temporal batching candidates: 0+1, 5+6, 6+7, 7+8, 8+9, 9+10, 10+11. These are hypotheses, not guaranteed savings.

Reflection: completed; actual self-report is archived separately and is not a causal verdict.

## authoring-format2-oct23-module-flat-prose-r3

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
| 5 | read | Read reference context; necessity not proven | reference | specs/token/token.spec.md | completed | unknown |  |
| 6 | bash | Unclassified; see safe command/raw trace | unknown | ls ai/directives/sdd-v2/formats; ls ai/directives/sdd-v2 | completed | 0 | opaque-shell |
| 7 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-inventory-format.xml | completed | unknown |  |
| 8 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-surface-format.xml | completed | unknown |  |
| 9 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/dbc-contracts.xml | completed | unknown |  |
| 10 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/diagram-vocabulary.xml | completed | unknown |  |
| 11 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 12 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/module-spec-structure.xml | completed | unknown |  |
| 13 | bash | Unclassified; see safe command/raw trace | unknown | rg -n "DECISION_LOG_ENTRY_FORMAT" ai   head -20 | completed | 0 | opaque-shell |
| 14 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/requirement-entry-format.xml | completed | unknown |  |
| 15 | read | Load workflow/instruction source | directive | ai/directives/sdd-v2/root.directive.xml | completed | unknown |  |
| 16 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 17 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 18 | bash | Unclassified; see safe command/raw trace | unknown | rg -n --glob '!node_modules/**' --glob '*.spec.md' -- "REQ-" specs docs   head -40; rg -n "SPEC_ID acronym" docs ai/directives/sdd-v2   head -40 | completed | 0 | opaque-shell |
| 19 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 20 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 21 | read | Read current target (skeleton or result) | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 22 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 23 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 24 | read | Read current target (skeleton or result) | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 25 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 26 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 27 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 28 | read | Read current target (skeleton or result) | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |

Read attempts: inputs/brief.md ×1; ai/directives/sdd-v2/module.directive.xml ×1; specs/token/normalize/normalize.spec.md ×4; specs/token/token.spec.md ×1; ai/directives/sdd-v2/formats/entity-inventory-format.xml ×1; ai/directives/sdd-v2/formats/entity-surface-format.xml ×1; ai/directives/sdd-v2/formats/dbc-contracts.xml ×1; ai/directives/sdd-v2/formats/diagram-vocabulary.xml ×1; ai/directives/sdd-v2/formats/module-spec-structure.xml ×1; ai/directives/sdd-v2/formats/requirement-entry-format.xml ×1; ai/directives/sdd-v2/root.directive.xml ×1.

Temporal batching candidates: 0+1, 7+8, 8+9, 9+10, 14+15. These are hypotheses, not guaranteed savings.

Reflection: completed; actual self-report is archived separately and is not a causal verdict.

## authoring-format2-oct23-module-nested-prose-r3

Artifact=false; semantic=fail; path=false; status=completed.

Failed artifact checks: relative-links. Path detail: opaque Bash command: whole-write-only path unproven.

Binding/capture/cleanup issues: none. SDK REST measurement requests (including polling): unknown.

Categories below describe observable actions, not private reasoning or proven necessity. Read/write rows are attempts; status/exit retain failures. Withheld shell payloads remain unknown, never guessed.

| Order | Tool | Observable role (not intent) | Category | Path / sanitized command | Status | Exit | Issues |
|---:|---|---|---|---|---|---:|---|
| 0 | read | Load declared task facts | reference | inputs/brief.md | completed | unknown |  |
| 1 | read | Load workflow/instruction source | directive | ai/directives/sdd-v2/module.directive.xml | completed | unknown |  |
| 2 | bash | Invoke canonical creation | create | npx --no-install gennady sdd-new module --scope token --module pipeline/normalize | completed | 0 |  |
| 3 | read | Read current target (skeleton or result) | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 4 | bash | Unclassified; see safe command/raw trace | unknown | find specs -maxdepth 4 -type f   sort | completed | 0 | opaque-shell |
| 5 | read | Read reference context; necessity not proven | reference | specs/token/token.spec.md | completed | unknown |  |
| 6 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-inventory-format.xml | completed | unknown |  |
| 7 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-surface-format.xml | completed | unknown |  |
| 8 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/dbc-contracts.xml | completed | unknown |  |
| 9 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/diagram-vocabulary.xml | completed | unknown |  |
| 10 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/decision-log-formats.xml | error | unknown |  |
| 11 | bash | Unclassified; see safe command/raw trace | unknown | ls ai/directives/sdd-v2/formats | completed | 0 | unrecognized-command |
| 12 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/module-spec-structure.xml | completed | unknown |  |
| 13 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/requirement-entry-format.xml | completed | unknown |  |
| 14 | bash | Unclassified; see safe command/raw trace | unknown | grep -rn "DECISION_LOG_ENTRY_FORMAT" ai specs --include=*.xml --include=*.md   head -20 | completed | 0 | opaque-shell |
| 15 | grep | Inspect available paths/state | discovery | unknown | completed | unknown |  |
| 16 | bash | Unclassified; see safe command/raw trace | unknown | sed -n '500,530p' ai/directives/sdd-v2/root.directive.xml | completed | 0 | opaque-shell |
| 17 | bash | Unclassified; see safe command/raw trace | unknown | ls -la; find . -maxdepth 2 -type f -not -path './.git/*'   sort   head -50 | completed | 0 | opaque-shell |
| 18 | read | Read reference context; necessity not proven | reference | package.json | completed | unknown |  |
| 19 | read | Read reference context; necessity not proven | reference | docs/token-contract.md | completed | unknown |  |
| 20 | read | Read reference context; necessity not proven | reference | specs/README.md | completed | unknown |  |
| 21 | bash | Unclassified; see safe command/raw trace | unknown | find ai/directives -maxdepth 2 -type f   sort | completed | 0 | opaque-shell |
| 22 | bash | Unclassified; see safe command/raw trace | unknown | git status --porcelain=v1 | completed | 0 | unrecognized-command |
| 23 | write | Whole-file write attempt | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 24 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 25 | read | Read current target (skeleton or result) | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 26 | bash | Unclassified; see safe command/raw trace | unknown | git diff -- specs/token/pipeline/normalize/normalize.spec.md   head -5 | completed | 0 | opaque-shell |
| 27 | write | Whole-file write attempt | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 28 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 29 | bash | Unclassified; see safe command/raw trace | unknown | git status --porcelain=v1 | completed | 0 | unrecognized-command |

Read attempts: inputs/brief.md ×1; ai/directives/sdd-v2/module.directive.xml ×1; specs/token/pipeline/normalize/normalize.spec.md ×2; specs/token/token.spec.md ×1; ai/directives/sdd-v2/formats/entity-inventory-format.xml ×1; ai/directives/sdd-v2/formats/entity-surface-format.xml ×1; ai/directives/sdd-v2/formats/dbc-contracts.xml ×1; ai/directives/sdd-v2/formats/diagram-vocabulary.xml ×1; ai/directives/sdd-v2/formats/decision-log-formats.xml ×1; ai/directives/sdd-v2/formats/module-spec-structure.xml ×1; ai/directives/sdd-v2/formats/requirement-entry-format.xml ×1; package.json ×1; docs/token-contract.md ×1; specs/README.md ×1.

Temporal batching candidates: 0+1, 5+6, 6+7, 7+8, 8+9, 12+13, 18+19, 19+20. These are hypotheses, not guaranteed savings.

Reflection: completed; actual self-report is archived separately and is not a causal verdict.
