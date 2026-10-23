# Authoring trajectory baseline

Source: 7f3656672f18463044a9d84706b5d3c4de4d031c; model: llm-proxy/deepseek-v4-flash. Recorded 6/6.

Baseline only — no prompt, speed or quality improvement is claimed.

| Case | Saved/planned | Artifact | Semantic | Joint | Path proven | Tools median | Reads | Writes/edits | Bash | Repeated reads | Worker tokens* | Worker messages | Worker seconds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| module-flat | 3/3 | 3 | 1 | 1 | 0 | 22 | 11 | 2 | 9 | 0 | 48631 (3/3) | 15 | 77.1 |
| module-nested | 3/3 | 3 | 3 | 3 | 0 | 28 | 12 | 2 | 14 | 1 | 49902 (3/3) | 19 | 95.5 |

*Non-cache tokens. Per-role input/output/reasoning/cache counters are in report.json. Cost and provider HTTP retries are unknown.

- A baseline only: no optimization or causal speedup has been demonstrated.
- Artifact, semantic and path verdicts are separate; opaque Bash is not proof of a forbidden write.
- Read/write counts are attempts, not bytes read or filesystem changes. An observed repeat is not necessarily waste.
- Token totals exclude cache reads; cache counters and model messages are separate in per-role profiles.
- SDK REST requests include polling and are not provider HTTP calls; proxy retries and monetary cost are unknown.
- Three repetitions describe these synthetic artifact cases, not statistical equivalence or the complete interactive SDD flow.

## authoring-format2-oct23-module-flat-pseudocode-r1

Artifact=true; semantic=fail; path=false; status=completed.

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
| 6 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-inventory-format.xml | completed | unknown |  |
| 7 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-surface-format.xml | completed | unknown |  |
| 8 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/dbc-contracts.xml | completed | unknown |  |
| 9 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/diagram-vocabulary.xml | completed | unknown |  |
| 10 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/module-spec-structure.xml | completed | unknown |  |
| 11 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/requirement-entry-format.xml | completed | unknown |  |
| 12 | bash | Unclassified; see safe command/raw trace | unknown | rg -n "SPEC_ID ACR acronym MODULE_REQUIREMENTS" ai/directives/sdd-v2 --glob '*.xml'   head -80 | completed | 0 | opaque-shell |
| 13 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 14 | read | Read reference context; necessity not proven | reference | specs/README.md | completed | unknown |  |
| 15 | bash | Unclassified; see safe command/raw trace | unknown | cat package.json; cat AGENTS.md | completed | 0 | opaque-shell |
| 16 | read | Read reference context; necessity not proven | reference | specs/infra-base/infra-base.spec.md | completed | unknown |  |
| 17 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 18 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 19 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 20 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 21 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |

Read attempts: inputs/brief.md ×1; ai/directives/sdd-v2/module.directive.xml ×1; specs/token/normalize/normalize.spec.md ×1; specs/token/token.spec.md ×1; ai/directives/sdd-v2/formats/entity-inventory-format.xml ×1; ai/directives/sdd-v2/formats/entity-surface-format.xml ×1; ai/directives/sdd-v2/formats/dbc-contracts.xml ×1; ai/directives/sdd-v2/formats/diagram-vocabulary.xml ×1; ai/directives/sdd-v2/formats/module-spec-structure.xml ×1; ai/directives/sdd-v2/formats/requirement-entry-format.xml ×1; specs/README.md ×1; specs/infra-base/infra-base.spec.md ×1.

Temporal batching candidates: 0+1, 5+6, 6+7, 7+8, 8+9, 9+10, 10+11. These are hypotheses, not guaranteed savings.

Reflection: completed; actual self-report is archived separately and is not a causal verdict.

## authoring-format2-oct23-module-nested-pseudocode-r1

Artifact=true; semantic=pass; path=false; status=completed.

Failed artifact checks: none. Path detail: opaque Bash command: whole-write-only path unproven.

Binding/capture/cleanup issues: none. SDK REST measurement requests (including polling): unknown.

Categories below describe observable actions, not private reasoning or proven necessity. Read/write rows are attempts; status/exit retain failures. Withheld shell payloads remain unknown, never guessed.

| Order | Tool | Observable role (not intent) | Category | Path / sanitized command | Status | Exit | Issues |
|---:|---|---|---|---|---|---:|---|
| 0 | read | Load declared task facts | reference | inputs/brief.md | completed | unknown |  |
| 1 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 2 | read | Load workflow/instruction source | directive | ai/directives/sdd-v2/module.directive.xml | completed | unknown |  |
| 3 | bash | Invoke canonical creation | create | npx --no-install gennady sdd-new module --scope token --module pipeline/normalize | completed | 0 |  |
| 4 | read | Read current target (skeleton or result) | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 5 | bash | Unclassified; see safe command/raw trace | unknown | find specs -maxdepth 4 -type f   sort | completed | 0 | opaque-shell |
| 6 | read | Read reference context; necessity not proven | reference | specs/token/token.spec.md | completed | unknown |  |
| 7 | bash | Unclassified; see safe command/raw trace | unknown | ls ai/directives/sdd-v2/formats | completed | 0 | unrecognized-command |
| 8 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-inventory-format.xml | completed | unknown |  |
| 9 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-surface-format.xml | completed | unknown |  |
| 10 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/dbc-contracts.xml | completed | unknown |  |
| 11 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/diagram-vocabulary.xml | completed | unknown |  |
| 12 | bash | Unclassified; see safe command/raw trace | unknown | rg -l "DECISION_LOG_ENTRY_FORMAT REQUIREMENT_ENTRY_FORMAT" ai/directives/sdd-v2   head -20 | completed | 0 | opaque-shell |
| 13 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/requirement-entry-format.xml | completed | unknown |  |
| 14 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 1 | embedded-shell-payload-withheld |
| 15 | bash | Unclassified; see safe command/raw trace | unknown | rg -n -B2 -A35 'DECISION_LOG_ENTRY_FORMAT' ai/directives/sdd-v2/root.directive.xml   head -100 | completed | 0 | opaque-shell |
| 16 | bash | Unclassified; see safe command/raw trace | unknown | rg -n "ACR acronym module acronym REQUIREMENTS" ai/directives/sdd-v2/formats/module-spec-structure.xml   head -60 | completed | 0 | opaque-shell |
| 17 | bash | Unclassified; see safe command/raw trace | unknown | rg -n "REQ- DL- acronym ACR" specs docs ai/directives/sdd-v2/guides   head -60 | completed | 0 | opaque-shell |
| 18 | bash | Unclassified; see safe command/raw trace | unknown | rg -n "no sibling No sibling INTER_MODULE dependency graph Depends on" ai/directives/sdd-v2/formats/module-spec-structure.xml ai/directives/sdd-v2/*.xml   head -40 | completed | 0 | opaque-shell |
| 19 | bash | Unclassified; see safe command/raw trace | unknown | cat package.json; find . -maxdepth 2 -type d -name 'src' -o -name 'lib' -o -name 'test'   sort; ls docs ai/directives   head -40 | completed | 0 | opaque-shell |
| 20 | read | Read reference context; necessity not proven | reference | docs/token-contract.md | completed | unknown |  |
| 21 | bash | Unclassified; see safe command/raw trace | unknown | ls ai/directives/coding ai/directives/testing; ls ai/directives/sdd-v2/guides | completed | 0 | opaque-shell |
| 22 | bash | Unclassified; see safe command/raw trace | unknown | rg -n "src/ \.ts typescript vitest node-test" AGENTS.md specs docs ai/directives/sdd-v2/guides   head -40 | completed | 0 | opaque-shell |
| 23 | write | Whole-file write attempt | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 24 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 25 | read | Read current target (skeleton or result) | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 26 | write | Whole-file write attempt | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 27 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 28 | bash | Unclassified; see safe command/raw trace | unknown | git status --short | completed | 0 | unrecognized-command |

Read attempts: inputs/brief.md ×1; ai/directives/sdd-v2/module.directive.xml ×1; specs/token/pipeline/normalize/normalize.spec.md ×2; specs/token/token.spec.md ×1; ai/directives/sdd-v2/formats/entity-inventory-format.xml ×1; ai/directives/sdd-v2/formats/entity-surface-format.xml ×1; ai/directives/sdd-v2/formats/dbc-contracts.xml ×1; ai/directives/sdd-v2/formats/diagram-vocabulary.xml ×1; ai/directives/sdd-v2/formats/requirement-entry-format.xml ×1; docs/token-contract.md ×1.

Temporal batching candidates: 8+9, 9+10, 10+11. These are hypotheses, not guaranteed savings.

Reflection: completed; actual self-report is archived separately and is not a causal verdict.

## authoring-format2-oct23-module-flat-pseudocode-r2

Artifact=true; semantic=fail; path=false; status=completed.

Failed artifact checks: none. Path detail: opaque Bash command: whole-write-only path unproven; actual create→target read→whole Write order not proven; successful target check after final Write not proven.

Binding/capture/cleanup issues: none. SDK REST measurement requests (including polling): unknown.

Categories below describe observable actions, not private reasoning or proven necessity. Read/write rows are attempts; status/exit retain failures. Withheld shell payloads remain unknown, never guessed.

| Order | Tool | Observable role (not intent) | Category | Path / sanitized command | Status | Exit | Issues |
|---:|---|---|---|---|---|---:|---|
| 0 | read | Load declared task facts | reference | inputs/brief.md | completed | unknown |  |
| 1 | read | Load workflow/instruction source | directive | ai/directives/sdd-v2/module.directive.xml | completed | unknown |  |
| 2 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 3 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 4 | bash | Unclassified; see safe command/raw trace | unknown | cd . && npx --no-install gennady sdd-new module --scope token --module normalize | completed | 0 | opaque-shell |
| 5 | read | Read current target (skeleton or result) | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 6 | read | Read reference context; necessity not proven | reference | specs/token/token.spec.md | completed | unknown |  |
| 7 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-inventory-format.xml | completed | unknown |  |
| 8 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-surface-format.xml | completed | unknown |  |
| 9 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/dbc-contracts.xml | completed | unknown |  |
| 10 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/diagram-vocabulary.xml | completed | unknown |  |
| 11 | bash | Unclassified; see safe command/raw trace | unknown | cd . && grep -rn "ACR" ai/directives/sdd-v2 --include=*.xml   head -40 | completed | 0 | opaque-shell |
| 12 | bash | Unclassified; see safe command/raw trace | unknown | cd . && grep -rn "ACR" ai/directives/sdd-v2   head -50 | completed | 0 | opaque-shell |
| 13 | bash | Unclassified; see safe command/raw trace | unknown | cd . && grep -rni "acronym" ai/directives   head -40 | completed | 0 | opaque-shell |
| 14 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/requirement-entry-format.xml | completed | unknown |  |
| 15 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 16 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 17 | bash | Unclassified; see safe command/raw trace | unknown | cd . && grep -rn "SPEC_ID\ spec id\ Spec ID\ module acronym\ module name" ai/directives/sdd-v2/scope.directive.xml ai/directives/sdd-v2/root.directive.xml ai/directives/sdd-v2/infra.directive.xml   head -50 | completed | 0 | opaque-shell |
| 18 | bash | Unclassified; see safe command/raw trace | unknown | cd . && grep -rn "REQ-" ai/directives/sdd-v2/audit ai/directives/sdd-v2/*.xml   grep -i "module\ NORM\ TOK"   head -30 | completed | 0 | opaque-shell |
| 19 | bash | Unclassified; see safe command/raw trace | unknown | cd . && ls ai/directives/testing && ls ai/directives/coding | completed | 0 | opaque-shell |
| 20 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 21 | bash | Unclassified; see safe command/raw trace | unknown | cd . && npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 | opaque-shell |
| 22 | bash | Unclassified; see safe command/raw trace | unknown | cd . && grep -n "NORM-" specs/token/normalize/normalize.spec.md | completed | 0 | opaque-shell |
| 23 | read | Read current target (skeleton or result) | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 24 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 25 | bash | Unclassified; see safe command/raw trace | unknown | cd . && sed -n '170,188p' specs/token/normalize/normalize.spec.md | completed | 0 | opaque-shell |
| 26 | bash | Unclassified; see safe command/raw trace | unknown | cd . && npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 | opaque-shell |
| 27 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 28 | read | Read current target (skeleton or result) | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |

Read attempts: inputs/brief.md ×1; ai/directives/sdd-v2/module.directive.xml ×1; specs/token/normalize/normalize.spec.md ×3; specs/token/token.spec.md ×1; ai/directives/sdd-v2/formats/entity-inventory-format.xml ×1; ai/directives/sdd-v2/formats/entity-surface-format.xml ×1; ai/directives/sdd-v2/formats/dbc-contracts.xml ×1; ai/directives/sdd-v2/formats/diagram-vocabulary.xml ×1; ai/directives/sdd-v2/formats/requirement-entry-format.xml ×1.

Temporal batching candidates: 0+1, 5+6, 6+7, 7+8, 8+9, 9+10. These are hypotheses, not guaranteed savings.

Reflection: completed; actual self-report is archived separately and is not a causal verdict.

## authoring-format2-oct23-module-nested-pseudocode-r2

Artifact=true; semantic=pass; path=false; status=completed.

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
| 5 | bash | Unclassified; see safe command/raw trace | unknown | find specs -type f   sort | completed | 0 | opaque-shell |
| 6 | read | Read reference context; necessity not proven | reference | specs/token/token.spec.md | completed | unknown |  |
| 7 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-inventory-format.xml | completed | unknown |  |
| 8 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-surface-format.xml | completed | unknown |  |
| 9 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/dbc-contracts.xml | completed | unknown |  |
| 10 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/module-spec-structure.xml | completed | unknown |  |
| 11 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/requirement-entry-format.xml | completed | unknown |  |
| 12 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/diagram-vocabulary.xml | completed | unknown |  |
| 13 | bash | Unclassified; see safe command/raw trace | unknown | grep -rn "acronym\ ACR" ai/directives/sdd-v2 --include=*.xml   head -60 | completed | 0 | opaque-shell |
| 14 | read | Read reference context; necessity not proven | reference | specs/README.md | completed | unknown |  |
| 15 | read | Read reference context; necessity not proven | reference | specs/infra-base/infra-base.spec.md | completed | unknown |  |
| 16 | bash | Unclassified; see safe command/raw trace | unknown | grep -rn "acronym\ own acronym\ ACR" ai/directives/sdd-v2   head -80 | completed | 0 | opaque-shell |
| 17 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 1 | embedded-shell-payload-withheld |
| 18 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 19 | bash | Unclassified; see safe command/raw trace | unknown | ls -la; find . -maxdepth 2 -name package.json -not -path './node_modules/*' | completed | 0 | opaque-shell |
| 20 | bash | Unclassified; see safe command/raw trace | unknown | cat package.json | completed | 0 | unrecognized-command |
| 21 | bash | Unclassified; see safe command/raw trace | unknown | cat ai/directives/coding/README.md ai/directives/testing/README.md | completed | 0 | unrecognized-command |
| 22 | write | Whole-file write attempt | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 23 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 24 | bash | Unclassified; see safe command/raw trace | unknown | grep -n "NORM" specs/token/pipeline/normalize/normalize.spec.md | completed | 0 | opaque-shell |
| 25 | write | Whole-file write attempt | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 26 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 27 | bash | Unclassified; see safe command/raw trace | unknown | git status --porcelain | completed | 0 | unrecognized-command |

Read attempts: inputs/brief.md ×1; ai/directives/sdd-v2/module.directive.xml ×1; specs/token/pipeline/normalize/normalize.spec.md ×1; specs/token/token.spec.md ×1; ai/directives/sdd-v2/formats/entity-inventory-format.xml ×1; ai/directives/sdd-v2/formats/entity-surface-format.xml ×1; ai/directives/sdd-v2/formats/dbc-contracts.xml ×1; ai/directives/sdd-v2/formats/module-spec-structure.xml ×1; ai/directives/sdd-v2/formats/requirement-entry-format.xml ×1; ai/directives/sdd-v2/formats/diagram-vocabulary.xml ×1; specs/README.md ×1; specs/infra-base/infra-base.spec.md ×1.

Temporal batching candidates: 0+1, 6+7, 7+8, 8+9, 9+10, 10+11, 11+12, 14+15. These are hypotheses, not guaranteed savings.

Reflection: completed; actual self-report is archived separately and is not a causal verdict.

## authoring-format2-oct23-module-flat-pseudocode-r3

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
| 8 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/diagram-vocabulary.xml | completed | unknown |  |
| 9 | read | Read reference context; necessity not proven | reference | specs/token/token.spec.md | completed | unknown |  |
| 10 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 1 | embedded-shell-payload-withheld |
| 11 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/module-spec-structure.xml | completed | unknown |  |
| 12 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/requirement-entry-format.xml | completed | unknown |  |
| 13 | bash | Unclassified; see safe command/raw trace | unknown | rg -n "DECISION_LOG_ENTRY_FORMAT ACR" ai/directives/sdd-v2/formats/module-spec-structure.xml ai/directives/sdd-v2/*.xml   head -40 | completed | 0 | opaque-shell |
| 14 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 15 | bash | Unclassified; see safe command/raw trace | unknown | cat package.json; rg -n "DECISION_LOG_ENTRY_FORMAT" ai/directives/sdd-v2/interface.directive.xml -A45   head -70 | completed | 0 | opaque-shell |
| 16 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 17 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 18 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 19 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 20 | bash | Unclassified; see safe command/raw trace | unknown | git status --short && git diff --stat | completed | 0 | opaque-shell |

Read attempts: inputs/brief.md ×1; ai/directives/sdd-v2/module.directive.xml ×1; specs/token/normalize/normalize.spec.md ×1; ai/directives/sdd-v2/formats/entity-inventory-format.xml ×1; ai/directives/sdd-v2/formats/entity-surface-format.xml ×1; ai/directives/sdd-v2/formats/dbc-contracts.xml ×1; ai/directives/sdd-v2/formats/diagram-vocabulary.xml ×1; specs/token/token.spec.md ×1; ai/directives/sdd-v2/formats/module-spec-structure.xml ×1; ai/directives/sdd-v2/formats/requirement-entry-format.xml ×1.

Temporal batching candidates: 0+1, 5+6, 6+7, 7+8, 8+9, 11+12. These are hypotheses, not guaranteed savings.

Reflection: completed; actual self-report is archived separately and is not a causal verdict.

## authoring-format2-oct23-module-nested-pseudocode-r3

Artifact=true; semantic=pass; path=false; status=completed.

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
| 5 | bash | Unclassified; see safe command/raw trace | unknown | ls ai/directives/sdd-v2/formats/ | completed | 0 | unrecognized-command |
| 6 | read | Read reference context; necessity not proven | reference | specs/token/token.spec.md | completed | unknown |  |
| 7 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-inventory-format.xml | completed | unknown |  |
| 8 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-surface-format.xml | completed | unknown |  |
| 9 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/dbc-contracts.xml | completed | unknown |  |
| 10 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/diagram-vocabulary.xml | completed | unknown |  |
| 11 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 12 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 13 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/requirement-entry-format.xml | completed | unknown |  |
| 14 | bash | Unclassified; see safe command/raw trace | unknown | rg -n "DECISION_LOG_ENTRY_FORMAT" ai/directives/sdd-v2/formats ai/directives/sdd-v2   head | completed | 0 | opaque-shell |
| 15 | bash | Unclassified; see safe command/raw trace | unknown | rg -n 'id="DECISION_LOG_ENTRY_FORMAT"' ai/directives/sdd-v2 -g '*.xml' | completed | 0 | opaque-shell |
| 16 | read | Load workflow/instruction source | directive | ai/directives/sdd-v2/root.directive.xml | completed | unknown |  |
| 17 | bash | Unclassified; see safe command/raw trace | unknown | rg -n --glob '*.md' --glob '!node_modules' --glob '!ai/directives/**' -- "-REQ- -DL-" .   head -60 | completed | 0 | opaque-shell |
| 18 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 19 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 20 | read | Read reference context; necessity not proven | reference | package.json | completed | unknown |  |
| 21 | read | Read reference context; necessity not proven | reference | specs/infra-base/infra-base.spec.md | completed | unknown |  |
| 22 | write | Whole-file write attempt | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 23 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 24 | read | Read current target (skeleton or result) | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 25 | write | Whole-file write attempt | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 26 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 27 | bash | Unclassified; see safe command/raw trace | unknown | git status --porcelain && git diff --stat | completed | 0 | opaque-shell |

Read attempts: inputs/brief.md ×1; ai/directives/sdd-v2/module.directive.xml ×1; specs/token/pipeline/normalize/normalize.spec.md ×2; specs/token/token.spec.md ×1; ai/directives/sdd-v2/formats/entity-inventory-format.xml ×1; ai/directives/sdd-v2/formats/entity-surface-format.xml ×1; ai/directives/sdd-v2/formats/dbc-contracts.xml ×1; ai/directives/sdd-v2/formats/diagram-vocabulary.xml ×1; ai/directives/sdd-v2/formats/requirement-entry-format.xml ×1; ai/directives/sdd-v2/root.directive.xml ×1; package.json ×1; specs/infra-base/infra-base.spec.md ×1.

Temporal batching candidates: 0+1, 6+7, 7+8, 8+9, 9+10, 20+21. These are hypotheses, not guaranteed savings.

Reflection: completed; actual self-report is archived separately and is not a causal verdict.
