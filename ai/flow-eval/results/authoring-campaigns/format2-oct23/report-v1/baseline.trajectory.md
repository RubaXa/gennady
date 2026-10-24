# Authoring trajectory baseline

Source: c676bb090e6f4f93a199c9a46f9726be9260c865; model: llm-proxy/deepseek-v4-flash. Recorded 6/6.

Baseline only — no prompt, speed or quality improvement is claimed.

| Case | Saved/planned | Artifact | Semantic | Joint | Path proven | Tools median | Reads | Writes/edits | Bash | Repeated reads | Worker tokens* | Worker messages | Worker seconds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| module-flat | 3/3 | 2 | 2 | 2 | 0 | 29 | 14 | 2 | 12 | 0 | 52856 (3/3) | 18 | 88.8 |
| module-nested | 3/3 | 3 | 3 | 3 | 0 | 27 | 11 | 2 | 12 | 1 | 57299 (3/3) | 20 | 88.5 |

*Non-cache tokens. Per-role input/output/reasoning/cache counters are in report.json. Cost and provider HTTP retries are unknown.

- A baseline only: no optimization or causal speedup has been demonstrated.
- Artifact, semantic and path verdicts are separate; opaque Bash is not proof of a forbidden write.
- Read/write counts are attempts, not bytes read or filesystem changes. An observed repeat is not necessarily waste.
- Token totals exclude cache reads; cache counters and model messages are separate in per-role profiles.
- SDK REST requests include polling and are not provider HTTP calls; proxy retries and monetary cost are unknown.
- Three repetitions describe these synthetic artifact cases, not statistical equivalence or the complete interactive SDD flow.

## authoring-format2-oct23-module-flat-baseline-r1

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
| 4 | bash | Unclassified; see safe command/raw trace | unknown | ls specs/token && ls specs/token/normalize | completed | 0 | opaque-shell |
| 5 | read | Read reference context; necessity not proven | reference | specs/token/token.spec.md | completed | unknown |  |
| 6 | bash | Unclassified; see safe command/raw trace | unknown | ls ai/directives/sdd-v2/formats/ | completed | 0 | unrecognized-command |
| 7 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-inventory-format.xml | completed | unknown |  |
| 8 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-surface-format.xml | completed | unknown |  |
| 9 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/dbc-contracts.xml | completed | unknown |  |
| 10 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/diagram-vocabulary.xml | completed | unknown |  |
| 11 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/module-spec-structure.xml | completed | unknown |  |
| 12 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/requirement-entry-format.xml | completed | unknown |  |
| 13 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 14 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 15 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 1 | embedded-shell-payload-withheld |
| 16 | bash | Unclassified; see safe command/raw trace | unknown | find ai -maxdepth 3 -type f   head -60 | completed | 0 | opaque-shell |
| 17 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 18 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 19 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 20 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 21 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 22 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 23 | bash | Unclassified; see safe command/raw trace | unknown | git status --short | completed | 0 | unrecognized-command |

Read attempts: inputs/brief.md ×1; ai/directives/sdd-v2/module.directive.xml ×1; specs/token/normalize/normalize.spec.md ×1; specs/token/token.spec.md ×1; ai/directives/sdd-v2/formats/entity-inventory-format.xml ×1; ai/directives/sdd-v2/formats/entity-surface-format.xml ×1; ai/directives/sdd-v2/formats/dbc-contracts.xml ×1; ai/directives/sdd-v2/formats/diagram-vocabulary.xml ×1; ai/directives/sdd-v2/formats/module-spec-structure.xml ×1; ai/directives/sdd-v2/formats/requirement-entry-format.xml ×1.

Temporal batching candidates: 0+1, 7+8, 8+9, 9+10, 10+11, 11+12. These are hypotheses, not guaranteed savings.

Reflection: completed; actual self-report is archived separately and is not a causal verdict.

## authoring-format2-oct23-module-nested-baseline-r1

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
| 5 | bash | Unclassified; see safe command/raw trace | unknown | git status --short && git log --oneline -5 | completed | 0 | opaque-shell |
| 6 | read | Read reference context; necessity not proven | reference | specs/token/token.spec.md | completed | unknown |  |
| 7 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-inventory-format.xml | completed | unknown |  |
| 8 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-surface-format.xml | completed | unknown |  |
| 9 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/dbc-contracts.xml | completed | unknown |  |
| 10 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/diagram-vocabulary.xml | completed | unknown |  |
| 11 | bash | Unclassified; see safe command/raw trace | unknown | grep -rn "DECISION_LOG_ENTRY_FORMAT" ai/directives/sdd-v2   head -20 | completed | 0 | opaque-shell |
| 12 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/module-spec-structure.xml | completed | unknown |  |
| 13 | bash | Unclassified; see safe command/raw trace | unknown | sed -n '595,640p' ai/directives/sdd-v2/root.directive.xml | completed | 0 | opaque-shell |
| 14 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 15 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 16 | bash | Unclassified; see safe command/raw trace | unknown | sed -n '190,235p' ai/directives/sdd-v2/scaffold.directive.xml | completed | 0 | opaque-shell |
| 17 | bash | Unclassified; see safe command/raw trace | unknown | grep -rn "NO_ASCII\ NON_ASCII\ acronym\ ACR" ai/directives/sdd-v2/*.xml ai/directives/sdd-v2/formats/*.xml   head -40 | completed | 0 | opaque-shell |
| 18 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/requirement-entry-format.xml | completed | unknown |  |
| 19 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 20 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 21 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 22 | write | Whole-file write attempt | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 23 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 24 | read | Read current target (skeleton or result) | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 25 | write | Whole-file write attempt | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 26 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 27 | bash | Unclassified; see safe command/raw trace | unknown | git status --short && git diff --stat | completed | 0 | opaque-shell |
| 28 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 29 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |

Read attempts: inputs/brief.md ×1; ai/directives/sdd-v2/module.directive.xml ×1; specs/token/pipeline/normalize/normalize.spec.md ×2; specs/token/token.spec.md ×1; ai/directives/sdd-v2/formats/entity-inventory-format.xml ×1; ai/directives/sdd-v2/formats/entity-surface-format.xml ×1; ai/directives/sdd-v2/formats/dbc-contracts.xml ×1; ai/directives/sdd-v2/formats/diagram-vocabulary.xml ×1; ai/directives/sdd-v2/formats/module-spec-structure.xml ×1; ai/directives/sdd-v2/formats/requirement-entry-format.xml ×1.

Temporal batching candidates: 0+1, 6+7, 7+8, 8+9, 9+10. These are hypotheses, not guaranteed savings.

Reflection: completed; actual self-report is archived separately and is not a causal verdict.

## authoring-format2-oct23-module-flat-baseline-r2

Artifact=false; semantic=fail; path=false; status=completed.

Failed artifact checks: relative-links. Path detail: opaque Bash command: whole-write-only path unproven.

Binding/capture/cleanup issues: none. SDK REST measurement requests (including polling): unknown.

Categories below describe observable actions, not private reasoning or proven necessity. Read/write rows are attempts; status/exit retain failures. Withheld shell payloads remain unknown, never guessed.

| Order | Tool | Observable role (not intent) | Category | Path / sanitized command | Status | Exit | Issues |
|---:|---|---|---|---|---|---:|---|
| 0 | read | Load declared task facts | reference | inputs/brief.md | completed | unknown |  |
| 1 | bash | Unclassified; see safe command/raw trace | unknown | ls -la . | completed | 0 | unrecognized-command |
| 2 | read | Load workflow/instruction source | directive | ai/directives/sdd-v2/module.directive.xml | completed | unknown |  |
| 3 | bash | Unclassified; see safe command/raw trace | unknown | find ./specs ./docs ./ai -type f   sort | completed | 0 | opaque-shell |
| 4 | read | Read reference context; necessity not proven | reference | specs/token/token.spec.md | completed | unknown |  |
| 5 | read | Read reference context; necessity not proven | reference | docs/token-contract.md | completed | unknown |  |
| 6 | bash | Invoke canonical creation | create | npx --no-install gennady sdd-new module --scope token --module normalize | completed | 0 |  |
| 7 | read | Read current target (skeleton or result) | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 8 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-inventory-format.xml | completed | unknown |  |
| 9 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-surface-format.xml | completed | unknown |  |
| 10 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/dbc-contracts.xml | completed | unknown |  |
| 11 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/diagram-vocabulary.xml | completed | unknown |  |
| 12 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/requirement-entry-format.xml | completed | unknown |  |
| 13 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/module-spec-structure.xml | completed | unknown |  |
| 14 | read | Read reference context; necessity not proven | reference | specs/README.md | completed | unknown |  |
| 15 | read | Read reference context; necessity not proven | reference | package.json | completed | unknown |  |
| 16 | bash | Unclassified; see safe command/raw trace | unknown | find ./specs -maxdepth 3 -type d   sort | completed | 0 | opaque-shell |
| 17 | grep | Inspect available paths/state | discovery | unknown | completed | unknown |  |
| 18 | grep | Inspect available paths/state | discovery | unknown | completed | unknown |  |
| 19 | read | Read reference context; necessity not proven | reference | ai/skills/sdd/SKILL.md | completed | unknown |  |
| 20 | read | Read reference context; necessity not proven | reference | specs/infra-base/infra-base.spec.md | completed | unknown |  |
| 21 | bash | Unclassified; see safe command/raw trace | unknown | rg -n "REQ-.*ACR acronym SPEC_ID token-acr ACR" ai/directives/sdd-v2 --glob '*.xml'   head -80 | completed | 0 | opaque-shell |
| 22 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 23 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 24 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 25 | read | Read current target (skeleton or result) | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 26 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 27 | read | Read current target (skeleton or result) | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 28 | bash | Unclassified; see safe command/raw trace | unknown | git status --short && git diff --stat | completed | 0 | opaque-shell |

Read attempts: inputs/brief.md ×1; ai/directives/sdd-v2/module.directive.xml ×1; specs/token/token.spec.md ×1; docs/token-contract.md ×1; specs/token/normalize/normalize.spec.md ×3; ai/directives/sdd-v2/formats/entity-inventory-format.xml ×1; ai/directives/sdd-v2/formats/entity-surface-format.xml ×1; ai/directives/sdd-v2/formats/dbc-contracts.xml ×1; ai/directives/sdd-v2/formats/diagram-vocabulary.xml ×1; ai/directives/sdd-v2/formats/requirement-entry-format.xml ×1; ai/directives/sdd-v2/formats/module-spec-structure.xml ×1; specs/README.md ×1; package.json ×1; ai/skills/sdd/SKILL.md ×1; specs/infra-base/infra-base.spec.md ×1.

Temporal batching candidates: 4+5, 7+8, 8+9, 9+10, 10+11, 11+12, 12+13, 13+14, 14+15, 19+20. These are hypotheses, not guaranteed savings.

Reflection: completed; actual self-report is archived separately and is not a causal verdict.

## authoring-format2-oct23-module-nested-baseline-r2

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
| 5 | read | Read reference context; necessity not proven | reference | specs/token/token.spec.md | completed | unknown |  |
| 6 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 7 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-inventory-format.xml | completed | unknown |  |
| 8 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-surface-format.xml | completed | unknown |  |
| 9 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/dbc-contracts.xml | completed | unknown |  |
| 10 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/diagram-vocabulary.xml | completed | unknown |  |
| 11 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/requirement-entry-format.xml | completed | unknown |  |
| 12 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/module-spec-structure.xml | completed | unknown |  |
| 13 | bash | Unclassified; see safe command/raw trace | unknown | grep -rl "DECISION_LOG_ENTRY_FORMAT" ai/   sort | completed | 0 | opaque-shell |
| 14 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 15 | bash | Unclassified; see safe command/raw trace | unknown | sed -n '500,560p' ai/directives/sdd-v2/root.directive.xml | completed | 0 | opaque-shell |
| 16 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 17 | write | Whole-file write attempt | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 18 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 19 | write | Whole-file write attempt | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 20 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 21 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |

Read attempts: inputs/brief.md ×1; ai/directives/sdd-v2/module.directive.xml ×1; specs/token/pipeline/normalize/normalize.spec.md ×1; specs/token/token.spec.md ×1; ai/directives/sdd-v2/formats/entity-inventory-format.xml ×1; ai/directives/sdd-v2/formats/entity-surface-format.xml ×1; ai/directives/sdd-v2/formats/dbc-contracts.xml ×1; ai/directives/sdd-v2/formats/diagram-vocabulary.xml ×1; ai/directives/sdd-v2/formats/requirement-entry-format.xml ×1; ai/directives/sdd-v2/formats/module-spec-structure.xml ×1.

Temporal batching candidates: 0+1, 7+8, 8+9, 9+10, 10+11, 11+12. These are hypotheses, not guaranteed savings.

Reflection: completed; actual self-report is archived separately and is not a causal verdict.

## authoring-format2-oct23-module-flat-baseline-r3

Artifact=true; semantic=pass; path=false; status=completed.

Failed artifact checks: none. Path detail: opaque Bash command: whole-write-only path unproven.

Binding/capture/cleanup issues: none. SDK REST measurement requests (including polling): unknown.

Categories below describe observable actions, not private reasoning or proven necessity. Read/write rows are attempts; status/exit retain failures. Withheld shell payloads remain unknown, never guessed.

| Order | Tool | Observable role (not intent) | Category | Path / sanitized command | Status | Exit | Issues |
|---:|---|---|---|---|---|---:|---|
| 0 | read | Load declared task facts | reference | inputs/brief.md | completed | unknown |  |
| 1 | read | Load workflow/instruction source | directive | ai/directives/sdd-v2/module.directive.xml | completed | unknown |  |
| 2 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 3 | bash | Unclassified; see safe command/raw trace | unknown | git status --porcelain && git log --oneline -5 | completed | 0 | opaque-shell |
| 4 | bash | Unclassified; see safe command/raw trace | unknown | find specs -type f -maxdepth 4 -print | completed | 0 | unrecognized-command |
| 5 | read | Read reference context; necessity not proven | reference | specs/README.md | completed | unknown |  |
| 6 | bash | Invoke canonical creation | create | npx --no-install gennady sdd-new module --scope token --module normalize | completed | 0 |  |
| 7 | read | Read current target (skeleton or result) | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 8 | read | Read reference context; necessity not proven | reference | specs/token/token.spec.md | completed | unknown |  |
| 9 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-inventory-format.xml | completed | unknown |  |
| 10 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-surface-format.xml | completed | unknown |  |
| 11 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/dbc-contracts.xml | completed | unknown |  |
| 12 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/diagram-vocabulary.xml | completed | unknown |  |
| 13 | bash | Unclassified; see safe command/raw trace | unknown | ls ai/directives/sdd-v2/formats | completed | 0 | unrecognized-command |
| 14 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/decision-log-format.xml | error | unknown |  |
| 15 | bash | Unclassified; see safe command/raw trace | unknown | rg -n "DECISION_LOG_ENTRY_FORMAT" ai   head -20 | completed | 0 | opaque-shell |
| 16 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/module-spec-structure.xml | completed | unknown |  |
| 17 | read | Load workflow/instruction source | directive | ai/directives/sdd-v2/root.directive.xml | completed | unknown |  |
| 18 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 19 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/requirement-entry-format.xml | completed | unknown |  |
| 20 | bash | Unclassified; see safe command/raw trace | unknown | find docs -type f -maxdepth 5 -print && cat package.json | completed | 0 | opaque-shell |
| 21 | bash | Unclassified; see safe command/raw trace | unknown | rg -n "normalize-example empty-input-rejection Foo__BAR" . --glob '!node_modules/**' --glob '!.git/**' | completed | 0 | opaque-shell |
| 22 | read | Read reference context; necessity not proven | reference | docs/token-contract.md | completed | unknown |  |
| 23 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 24 | bash | Unclassified; see safe command/raw trace | unknown | rg -n "SPEC_ID acronym ACR" ai/directives/sdd-v2/root.directive.xml ai/directives/sdd-v2/module.directive.xml ai/directives/sdd-v2/formats/*.xml   head -40 | completed | 0 | opaque-shell |
| 25 | bash | Unclassified; see safe command/raw trace | unknown | rg -n "SPEC_ID acronym" ai/directives/sdd-v2/scaffold.directive.xml ai/directives/sdd-v2/scope.directive.xml   head -30 | completed | 0 | opaque-shell |
| 26 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 27 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 28 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 29 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 30 | bash | Unclassified; see safe command/raw trace | unknown | git status --porcelain && git diff --stat | completed | 0 | opaque-shell |

Read attempts: inputs/brief.md ×1; ai/directives/sdd-v2/module.directive.xml ×1; specs/README.md ×1; specs/token/normalize/normalize.spec.md ×1; specs/token/token.spec.md ×1; ai/directives/sdd-v2/formats/entity-inventory-format.xml ×1; ai/directives/sdd-v2/formats/entity-surface-format.xml ×1; ai/directives/sdd-v2/formats/dbc-contracts.xml ×1; ai/directives/sdd-v2/formats/diagram-vocabulary.xml ×1; ai/directives/sdd-v2/formats/decision-log-format.xml ×1; ai/directives/sdd-v2/formats/module-spec-structure.xml ×1; ai/directives/sdd-v2/root.directive.xml ×1; ai/directives/sdd-v2/formats/requirement-entry-format.xml ×1; docs/token-contract.md ×1.

Temporal batching candidates: 0+1, 7+8, 8+9, 9+10, 10+11, 11+12, 16+17. These are hypotheses, not guaranteed savings.

Reflection: completed; actual self-report is archived separately and is not a causal verdict.

## authoring-format2-oct23-module-nested-baseline-r3

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
| 5 | read | Read reference context; necessity not proven | reference | specs/token/token.spec.md | completed | unknown |  |
| 6 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-inventory-format.xml | completed | unknown |  |
| 7 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-surface-format.xml | completed | unknown |  |
| 8 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/dbc-contracts.xml | completed | unknown |  |
| 9 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/requirement-entry-format.xml | completed | unknown |  |
| 10 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/diagram-vocabulary.xml | completed | unknown |  |
| 11 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 12 | bash | Unclassified; see safe command/raw trace | unknown | ls -R docs; git log --oneline -5 | completed | 0 | opaque-shell |
| 13 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/module-spec-structure.xml | completed | unknown |  |
| 14 | read | Read reference context; necessity not proven | reference | docs/token-contract.md | completed | unknown |  |
| 15 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/module-diagram-ladder.example.md | completed | unknown |  |
| 16 | bash | Unclassified; see safe command/raw trace | unknown | rg -n "acronym ACR SPEC_ID module.*REQ" ai/directives/sdd-v2 --glob '*.xml'   head -80 | completed | 0 | opaque-shell |
| 17 | bash | Unclassified; see safe command/raw trace | unknown | rg -n "SPEC_ID acronym require.*ID REQ-" ai/directives/sdd-v2/audit/steps/STEP_1_MECHANICAL.xml ai/directives/sdd-v2/root.directive.xml   head -120 | completed | 0 | opaque-shell |
| 18 | bash | Unclassified; see safe command/raw trace | unknown | sed -n '500,535p' ai/directives/sdd-v2/root.directive.xml | completed | 0 | opaque-shell |
| 19 | bash | Unclassified; see safe command/raw trace | unknown | cat package.json | completed | 0 | unrecognized-command |
| 20 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 21 | write | Whole-file write attempt | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 22 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 23 | read | Read current target (skeleton or result) | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 24 | write | Whole-file write attempt | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 25 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 26 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |

Read attempts: inputs/brief.md ×1; ai/directives/sdd-v2/module.directive.xml ×1; specs/token/pipeline/normalize/normalize.spec.md ×2; specs/token/token.spec.md ×1; ai/directives/sdd-v2/formats/entity-inventory-format.xml ×1; ai/directives/sdd-v2/formats/entity-surface-format.xml ×1; ai/directives/sdd-v2/formats/dbc-contracts.xml ×1; ai/directives/sdd-v2/formats/requirement-entry-format.xml ×1; ai/directives/sdd-v2/formats/diagram-vocabulary.xml ×1; ai/directives/sdd-v2/formats/module-spec-structure.xml ×1; docs/token-contract.md ×1; ai/directives/sdd-v2/formats/module-diagram-ladder.example.md ×1.

Temporal batching candidates: 0+1, 5+6, 6+7, 7+8, 8+9, 9+10, 13+14, 14+15. These are hypotheses, not guaranteed savings.

Reflection: completed; actual self-report is archived separately and is not a causal verdict.
