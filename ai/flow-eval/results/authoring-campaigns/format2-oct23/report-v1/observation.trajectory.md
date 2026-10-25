# Authoring trajectory baseline

Source: 822ba00b0ece32697fc60e2dd5f2348188a5e270; model: llm-proxy/deepseek-v4-flash. Recorded 6/6.

Baseline only — no prompt, speed or quality improvement is claimed.

| Case | Saved/planned | Artifact | Semantic | Joint | Path proven | Tools median | Reads | Writes/edits | Bash | Repeated reads | Worker tokens* | Worker messages | Worker seconds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| module-flat | 3/3 | 2 | 2 | 2 | 0 | 26 | 11 | 2 | 13 | 0 | 50370 (3/3) | 18 | 80.0 |
| module-nested | 3/3 | 3 | 2 | 2 | 0 | 29 | 12 | 2 | 14 | 0 | 57470 (3/3) | 18 | 103.3 |

*Non-cache tokens. Per-role input/output/reasoning/cache counters are in report.json. Cost and provider HTTP retries are unknown.

- A baseline only: no optimization or causal speedup has been demonstrated.
- Artifact, semantic and path verdicts are separate; opaque Bash is not proof of a forbidden write.
- Read/write counts are attempts, not bytes read or filesystem changes. An observed repeat is not necessarily waste.
- Token totals exclude cache reads; cache counters and model messages are separate in per-role profiles.
- SDK REST requests include polling and are not provider HTTP calls; proxy retries and monetary cost are unknown.
- Three repetitions describe these synthetic artifact cases, not statistical equivalence or the complete interactive SDD flow.

## authoring-format2-oct23-module-flat-observation-r1

Artifact=true; semantic=pass; path=false; status=completed.

Failed artifact checks: none. Path detail: opaque Bash command: whole-write-only path unproven.

Binding/capture/cleanup issues: none. SDK REST measurement requests (including polling): unknown.

Categories below describe observable actions, not private reasoning or proven necessity. Read/write rows are attempts; status/exit retain failures. Withheld shell payloads remain unknown, never guessed.

| Order | Tool | Observable role (not intent) | Category | Path / sanitized command | Status | Exit | Issues |
|---:|---|---|---|---|---|---:|---|
| 0 | read | Load declared task facts | reference | inputs/brief.md | completed | unknown |  |
| 1 | bash | Unclassified; see safe command/raw trace | unknown | ls -la; find . -maxdepth 3 -not -path './node_modules*' -not -path './.git*'   sort   head -100 | completed | 0 | opaque-shell |
| 2 | read | Load workflow/instruction source | directive | ai/directives/sdd-v2/module.directive.xml | completed | unknown |  |
| 3 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 4 | bash | Invoke canonical creation | create | npx --no-install gennady sdd-new module --scope token --module normalize | completed | 0 |  |
| 5 | read | Read current target (skeleton or result) | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 6 | read | Read reference context; necessity not proven | reference | specs/token/token.spec.md | completed | unknown |  |
| 7 | read | Read reference context; necessity not proven | reference | docs/token-contract.md | completed | unknown |  |
| 8 | read | Read reference context; necessity not proven | reference | specs/README.md | completed | unknown |  |
| 9 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 10 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 11 | bash | Unclassified; see safe command/raw trace | unknown | cat ai/directives/sdd-v2/formats/module-spec-structure.xml | completed | 0 | unrecognized-command |
| 12 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 13 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 14 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 15 | read | Read reference context; necessity not proven | reference | specs/infra-base/infra-base.spec.md | completed | unknown |  |
| 16 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 17 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 18 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 19 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 20 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 21 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |

Read attempts: inputs/brief.md ×1; ai/directives/sdd-v2/module.directive.xml ×1; specs/token/normalize/normalize.spec.md ×1; specs/token/token.spec.md ×1; docs/token-contract.md ×1; specs/README.md ×1; specs/infra-base/infra-base.spec.md ×1.

Temporal batching candidates: 5+6, 6+7, 7+8. These are hypotheses, not guaranteed savings.

Reflection: completed; actual self-report is archived separately and is not a causal verdict.

## authoring-format2-oct23-module-nested-observation-r1

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
| 4 | bash | Unclassified; see safe command/raw trace | unknown | ls specs/token && ls ai/directives/sdd-v2/formats | completed | 0 | opaque-shell |
| 5 | bash | Inspect available paths/state | discovery | npx --no-install gennady sdd-orient specs/token/pipeline/normalize/normalize.spec.md | completed | 0 |  |
| 6 | read | Read reference context; necessity not proven | reference | specs/token/token.spec.md | completed | unknown |  |
| 7 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-inventory-format.xml | completed | unknown |  |
| 8 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-surface-format.xml | completed | unknown |  |
| 9 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/dbc-contracts.xml | completed | unknown |  |
| 10 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/diagram-vocabulary.xml | completed | unknown |  |
| 11 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/requirement-entry-format.xml | completed | unknown |  |
| 12 | bash | Unclassified; see safe command/raw trace | unknown | rg -l "DECISION_LOG_ENTRY_FORMAT" ai/directives   head -20 | completed | 0 | opaque-shell |
| 13 | bash | Unclassified; see safe command/raw trace | unknown | ls specs/token/pipeline/normalize && find specs/token/pipeline -maxdepth 3 -type f | completed | 0 | opaque-shell |
| 14 | bash | Unclassified; see safe command/raw trace | unknown | rg -n -A40 "DECISION_LOG_ENTRY_FORMAT" ai/directives/sdd-v2/root.directive.xml | completed | 0 | opaque-shell |
| 15 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/module-spec-structure.xml | completed | unknown |  |
| 16 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 17 | bash | Unclassified; see safe command/raw trace | unknown | rg -n "MODULE_REQUIREMENTS MODULE_MAP MODULE_DECISION_LOG REQUIRED_SECTIONS FOLD" ai/directives/sdd-v2/*.xml   head -50 | completed | 0 | opaque-shell |
| 18 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 19 | bash | Unclassified; see safe command/raw trace | unknown | ls -la; find . -maxdepth 2 -name 'package.json' -o -maxdepth 2 -name 'tsconfig.json'   head | completed | 0 | opaque-shell |
| 20 | bash | Unclassified; see safe command/raw trace | unknown | cat package.json; ls docs; find docs -type f -maxdepth 3 | completed | 0 | opaque-shell |
| 21 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/library-spec-structure.xml | completed | unknown |  |
| 22 | read | Read reference context; necessity not proven | reference | docs/token-contract.md | completed | unknown |  |
| 23 | write | Whole-file write attempt | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 24 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 25 | write | Whole-file write attempt | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 26 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 27 | bash | Unclassified; see safe command/raw trace | unknown | git status --short && git diff --stat | completed | 0 | opaque-shell |
| 28 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |

Read attempts: inputs/brief.md ×1; ai/directives/sdd-v2/module.directive.xml ×1; specs/token/pipeline/normalize/normalize.spec.md ×1; specs/token/token.spec.md ×1; ai/directives/sdd-v2/formats/entity-inventory-format.xml ×1; ai/directives/sdd-v2/formats/entity-surface-format.xml ×1; ai/directives/sdd-v2/formats/dbc-contracts.xml ×1; ai/directives/sdd-v2/formats/diagram-vocabulary.xml ×1; ai/directives/sdd-v2/formats/requirement-entry-format.xml ×1; ai/directives/sdd-v2/formats/module-spec-structure.xml ×1; ai/directives/sdd-v2/formats/library-spec-structure.xml ×1; docs/token-contract.md ×1.

Temporal batching candidates: 0+1, 6+7, 7+8, 8+9, 9+10, 10+11, 21+22. These are hypotheses, not guaranteed savings.

Reflection: completed; actual self-report is archived separately and is not a causal verdict.

## authoring-format2-oct23-module-flat-observation-r2

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
| 4 | bash | Unclassified; see safe command/raw trace | unknown | ls specs/token && ls ai/directives/sdd-v2/formats | completed | 0 | opaque-shell |
| 5 | read | Read reference context; necessity not proven | reference | specs/token/token.spec.md | completed | unknown |  |
| 6 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-inventory-format.xml | completed | unknown |  |
| 7 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-surface-format.xml | completed | unknown |  |
| 8 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/dbc-contracts.xml | completed | unknown |  |
| 9 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/diagram-vocabulary.xml | completed | unknown |  |
| 10 | bash | Unclassified; see safe command/raw trace | unknown | rg -n "normalize-example empty-input-rejection TOK-NORM MODULE_REQUIREMENTS" . --glob '!node_modules' --glob '!*.lock'   head -50 | completed | 0 | opaque-shell |
| 11 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/module-spec-structure.xml | completed | unknown |  |
| 12 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/requirement-entry-format.xml | completed | unknown |  |
| 13 | bash | Unclassified; see safe command/raw trace | unknown | rg -n "REQ-1 \[должен SPEC_ID Module Vision" specs ai --glob '*.md' --glob '*.xml'   head -40 | completed | 0 | opaque-shell |
| 14 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 15 | bash | Unclassified; see safe command/raw trace | unknown | rg -n "DECISION_LOG_ENTRY_FORMAT" ai/directives/sdd-v2 -l | completed | 0 | opaque-shell |
| 16 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 17 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/module-diagram-ladder.example.md | completed | unknown |  |
| 18 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 19 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 20 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 21 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 22 | bash | Unclassified; see safe command/raw trace | unknown | git status --short | completed | 0 | unrecognized-command |
| 23 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 24 | grep | Inspect available paths/state | discovery | unknown | error | unknown |  |
| 25 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |

Read attempts: inputs/brief.md ×1; ai/directives/sdd-v2/module.directive.xml ×1; specs/token/normalize/normalize.spec.md ×1; specs/token/token.spec.md ×1; ai/directives/sdd-v2/formats/entity-inventory-format.xml ×1; ai/directives/sdd-v2/formats/entity-surface-format.xml ×1; ai/directives/sdd-v2/formats/dbc-contracts.xml ×1; ai/directives/sdd-v2/formats/diagram-vocabulary.xml ×1; ai/directives/sdd-v2/formats/module-spec-structure.xml ×1; ai/directives/sdd-v2/formats/requirement-entry-format.xml ×1; ai/directives/sdd-v2/formats/module-diagram-ladder.example.md ×1.

Temporal batching candidates: 0+1, 5+6, 6+7, 7+8, 8+9, 11+12. These are hypotheses, not guaranteed savings.

Reflection: completed; actual self-report is archived separately and is not a causal verdict.

## authoring-format2-oct23-module-nested-observation-r2

Artifact=true; semantic=pass; path=false; status=completed.

Failed artifact checks: none. Path detail: opaque Bash command: whole-write-only path unproven.

Binding/capture/cleanup issues: none. SDK REST measurement requests (including polling): unknown.

Categories below describe observable actions, not private reasoning or proven necessity. Read/write rows are attempts; status/exit retain failures. Withheld shell payloads remain unknown, never guessed.

| Order | Tool | Observable role (not intent) | Category | Path / sanitized command | Status | Exit | Issues |
|---:|---|---|---|---|---|---:|---|
| 0 | read | Load declared task facts | reference | inputs/brief.md | completed | unknown |  |
| 1 | read | Load workflow/instruction source | directive | ai/directives/sdd-v2/module.directive.xml | completed | unknown |  |
| 2 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 3 | bash | Invoke canonical creation | create | npx --no-install gennady sdd-new module --scope token --module pipeline/normalize | completed | 0 |  |
| 4 | read | Read current target (skeleton or result) | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 5 | bash | Unclassified; see safe command/raw trace | unknown | ls -R specs/token && ls ai/directives/sdd-v2/formats | completed | 0 | opaque-shell |
| 6 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-inventory-format.xml | completed | unknown |  |
| 7 | read | Read reference context; necessity not proven | reference | specs/token/token.spec.md | completed | unknown |  |
| 8 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-surface-format.xml | completed | unknown |  |
| 9 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/dbc-contracts.xml | completed | unknown |  |
| 10 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/requirement-entry-format.xml | completed | unknown |  |
| 11 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/diagram-vocabulary.xml | completed | unknown |  |
| 12 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/module-spec-structure.xml | completed | unknown |  |
| 13 | bash | Unclassified; see safe command/raw trace | unknown | rg -l "DECISION_LOG_ENTRY_FORMAT" ai/directives   head | completed | 0 | opaque-shell |
| 14 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 15 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 16 | read | Read reference context; necessity not proven | reference | docs/token-contract.md | completed | unknown |  |
| 17 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/module-diagram-ladder.example.md | completed | unknown |  |
| 18 | bash | Unclassified; see safe command/raw trace | unknown | cat package.json; find . -maxdepth 2 -type f -name 'tsconfig*' -o -name 'vitest.config*'   head | completed | 0 | opaque-shell |
| 19 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 20 | bash | Unclassified; see safe command/raw trace | unknown | rg -n "ACR acronym REQ-" ai/directives/sdd-v2/formats/module-spec-structure.xml ai/directives/sdd-v2/module.directive.xml   head -40 | completed | 0 | opaque-shell |
| 21 | write | Whole-file write attempt | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 22 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 23 | write | Whole-file write attempt | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 24 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 25 | bash | Unclassified; see safe command/raw trace | unknown | cat specs/token/pipeline/normalize/normalize.spec.md | completed | 0 | unrecognized-command |
| 26 | write | Whole-file write attempt | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 27 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 28 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |

Read attempts: inputs/brief.md ×1; ai/directives/sdd-v2/module.directive.xml ×1; specs/token/pipeline/normalize/normalize.spec.md ×1; ai/directives/sdd-v2/formats/entity-inventory-format.xml ×1; specs/token/token.spec.md ×1; ai/directives/sdd-v2/formats/entity-surface-format.xml ×1; ai/directives/sdd-v2/formats/dbc-contracts.xml ×1; ai/directives/sdd-v2/formats/requirement-entry-format.xml ×1; ai/directives/sdd-v2/formats/diagram-vocabulary.xml ×1; ai/directives/sdd-v2/formats/module-spec-structure.xml ×1; docs/token-contract.md ×1; ai/directives/sdd-v2/formats/module-diagram-ladder.example.md ×1.

Temporal batching candidates: 0+1, 6+7, 7+8, 8+9, 9+10, 10+11, 11+12, 16+17. These are hypotheses, not guaranteed savings.

Reflection: completed; actual self-report is archived separately and is not a causal verdict.

## authoring-format2-oct23-module-flat-observation-r3

Artifact=false; semantic=fail; path=false; status=completed.

Failed artifact checks: relative-links. Path detail: opaque Bash command: whole-write-only path unproven.

Binding/capture/cleanup issues: none. SDK REST measurement requests (including polling): unknown.

Categories below describe observable actions, not private reasoning or proven necessity. Read/write rows are attempts; status/exit retain failures. Withheld shell payloads remain unknown, never guessed.

| Order | Tool | Observable role (not intent) | Category | Path / sanitized command | Status | Exit | Issues |
|---:|---|---|---|---|---|---:|---|
| 0 | read | Load declared task facts | reference | inputs/brief.md | completed | unknown |  |
| 1 | bash | Unclassified; see safe command/raw trace | unknown | ls -la . && find . -maxdepth 3 -not -path '*/node_modules/*' -not -path '*/.git/*'   sort | completed | 0 | opaque-shell |
| 2 | read | Load workflow/instruction source | directive | ai/directives/sdd-v2/module.directive.xml | completed | unknown |  |
| 3 | bash | Unclassified; see safe command/raw trace | unknown | ls -la ./ai/directives/sdd-v2/ && cat ./package.json | completed | 0 | opaque-shell |
| 4 | bash | Invoke canonical creation | create | npx --no-install gennady sdd-new module --scope token --module normalize | completed | 0 |  |
| 5 | read | Read current target (skeleton or result) | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 6 | read | Read reference context; necessity not proven | reference | specs/token/token.spec.md | completed | unknown |  |
| 7 | bash | Unclassified; see safe command/raw trace | unknown | ls ./ai/directives/sdd-v2/formats/ | completed | 0 | unrecognized-command |
| 8 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-inventory-format.xml | completed | unknown |  |
| 9 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-surface-format.xml | completed | unknown |  |
| 10 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/dbc-contracts.xml | completed | unknown |  |
| 11 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/diagram-vocabulary.xml | completed | unknown |  |
| 12 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/module-spec-structure.xml | completed | unknown |  |
| 13 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/requirement-entry-format.xml | completed | unknown |  |
| 14 | read | Read reference context; necessity not proven | reference | docs/token-contract.md | completed | unknown |  |
| 15 | read | Read reference context; necessity not proven | reference | specs/README.md | completed | unknown |  |
| 16 | bash | Unclassified; see safe command/raw trace | unknown | grep -rl "DECISION_LOG_ENTRY_FORMAT" ./ai/directives   head -20 | completed | 0 | opaque-shell |
| 17 | bash | Unclassified; see safe command/raw trace | unknown | grep -rn "MODULE_MAP\ Modules not yet decomposed" ./ai/directives/sdd-v2/*.xml   head -20 | completed | 0 | opaque-shell |
| 18 | bash | Unclassified; see safe command/raw trace | unknown | grep -n "DECISION_LOG_ENTRY_FORMAT" ./ai/directives/sdd-v2/root.directive.xml | completed | 0 | opaque-shell |
| 19 | read | Load workflow/instruction source | directive | ai/directives/sdd-v2/root.directive.xml | completed | unknown |  |
| 20 | bash | Unclassified; see safe command/raw trace | unknown | grep -rn "acronym" ./ai/directives/sdd-v2/*.xml ./ai/directives/sdd-v2/formats/*.xml   head -40 | completed | 0 | opaque-shell |
| 21 | bash | Unclassified; see safe command/raw trace | unknown | ls ./ai/directives/testing ./ai/directives/coding | completed | 0 | unrecognized-command |
| 22 | bash | Unclassified; see safe command/raw trace | unknown | grep -rn "TOKEN-NORMALIZE\ TOK-REQ\ normalize" . --exclude-dir=node_modules --exclude-dir=.git -l | completed | 0 | opaque-shell |
| 23 | read | Load workflow/instruction source | directive | .claude/skills/sdd-check/SKILL.md | completed | unknown |  |
| 24 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 25 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 26 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 27 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 28 | bash | Unclassified; see safe command/raw trace | unknown | git status --porcelain && git diff --stat | completed | 0 | opaque-shell |

Read attempts: inputs/brief.md ×1; ai/directives/sdd-v2/module.directive.xml ×1; specs/token/normalize/normalize.spec.md ×1; specs/token/token.spec.md ×1; ai/directives/sdd-v2/formats/entity-inventory-format.xml ×1; ai/directives/sdd-v2/formats/entity-surface-format.xml ×1; ai/directives/sdd-v2/formats/dbc-contracts.xml ×1; ai/directives/sdd-v2/formats/diagram-vocabulary.xml ×1; ai/directives/sdd-v2/formats/module-spec-structure.xml ×1; ai/directives/sdd-v2/formats/requirement-entry-format.xml ×1; docs/token-contract.md ×1; specs/README.md ×1; ai/directives/sdd-v2/root.directive.xml ×1; .claude/skills/sdd-check/SKILL.md ×1.

Temporal batching candidates: 5+6, 8+9, 9+10, 10+11, 11+12, 12+13, 13+14, 14+15. These are hypotheses, not guaranteed savings.

Reflection: completed; actual self-report is archived separately and is not a causal verdict.

## authoring-format2-oct23-module-nested-observation-r3

Artifact=true; semantic=fail; path=false; status=completed.

Failed artifact checks: none. Path detail: opaque Bash command: whole-write-only path unproven.

Binding/capture/cleanup issues: none. SDK REST measurement requests (including polling): unknown.

Categories below describe observable actions, not private reasoning or proven necessity. Read/write rows are attempts; status/exit retain failures. Withheld shell payloads remain unknown, never guessed.

| Order | Tool | Observable role (not intent) | Category | Path / sanitized command | Status | Exit | Issues |
|---:|---|---|---|---|---|---:|---|
| 0 | read | Load declared task facts | reference | inputs/brief.md | completed | unknown |  |
| 1 | read | Load workflow/instruction source | directive | ai/directives/sdd-v2/module.directive.xml | completed | unknown |  |
| 2 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 3 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 4 | bash | Invoke canonical creation | create | npx --no-install gennady sdd-new module --scope token --module pipeline/normalize | completed | 0 |  |
| 5 | read | Read current target (skeleton or result) | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 6 | read | Read reference context; necessity not proven | reference | specs/token/token.spec.md | completed | unknown |  |
| 7 | read | Read reference context; necessity not proven | reference | docs/token-contract.md | completed | unknown |  |
| 8 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-inventory-format.xml | completed | unknown |  |
| 9 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-surface-format.xml | completed | unknown |  |
| 10 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/dbc-contracts.xml | completed | unknown |  |
| 11 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/diagram-vocabulary.xml | completed | unknown |  |
| 12 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/requirement-entry-format.xml | completed | unknown |  |
| 13 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/module-spec-structure.xml | completed | unknown |  |
| 14 | read | Load workflow/instruction source | directive | .claude/skills/sdd-check/SKILL.md | completed | unknown |  |
| 15 | bash | Unclassified; see safe command/raw trace | unknown | ls -la specs/token && find specs/token -type f && cat package.json && git log --oneline -5 | completed | 0 | opaque-shell |
| 16 | read | Load workflow/instruction source | directive | ai/directives/sdd-v2/root.directive.xml | completed | unknown |  |
| 17 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 18 | write | Whole-file write attempt | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 19 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 20 | write | Whole-file write attempt | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 21 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 22 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |

Read attempts: inputs/brief.md ×1; ai/directives/sdd-v2/module.directive.xml ×1; specs/token/pipeline/normalize/normalize.spec.md ×1; specs/token/token.spec.md ×1; docs/token-contract.md ×1; ai/directives/sdd-v2/formats/entity-inventory-format.xml ×1; ai/directives/sdd-v2/formats/entity-surface-format.xml ×1; ai/directives/sdd-v2/formats/dbc-contracts.xml ×1; ai/directives/sdd-v2/formats/diagram-vocabulary.xml ×1; ai/directives/sdd-v2/formats/requirement-entry-format.xml ×1; ai/directives/sdd-v2/formats/module-spec-structure.xml ×1; .claude/skills/sdd-check/SKILL.md ×1; ai/directives/sdd-v2/root.directive.xml ×1.

Temporal batching candidates: 0+1, 5+6, 6+7, 7+8, 8+9, 9+10, 10+11, 11+12, 12+13, 13+14. These are hypotheses, not guaranteed savings.

Reflection: completed; actual self-report is archived separately and is not a causal verdict.
