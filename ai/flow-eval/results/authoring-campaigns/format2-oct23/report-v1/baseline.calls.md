# Authoring call audit

Frozen source c676bb090e6f4f93a199c9a46f9726be9260c865; input SHA-256 af16c6c2cb74fb5f00db26908f426d36aaed38bdf4d9b296b1e4d785395cee82.

Runs=6; calls=163; complete-timed=163.
Result fingerprints=162; failure diagnostics=0; terminal facts only=1.
Adjacent read pairs=42; already same message=31; across messages=11. Overlapping candidates, not additive savings.

Worker wall sum ms=532651; observed assistant messages=108; union of per-run tool intervals ms=818.
Tool timestamps do not allocate remaining time to inference, queueing, network, capture or other overhead.

No necessity/causality score is inferred. Read “contract-related” as justified operation class, not proof that every read or retry was needed.
Returned content, hidden motives and shell subcommand outcomes are not reconstructed. Reflection remains separately archived self-report, not an explanation certified by this table.

## module-flat repetition 1

Scenario: authoring-format2-oct23-module-flat-baseline-r1. Capture complete=true; omitted=0.

| Order and call ID | Tool | Information sought or operation | Assessment | Retained result | ms | Path or safe command |
|---|---|---|---|---|---:|---|
| 0 call_00_1seeJDJVNbwm2lnK0zrW5760 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 4 | inputs/brief.md |
| 1 call_01_xgMryvOvfJkZRssUnXZW2505 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/module.directive.xml |
| 2 call_00_xLgbYGRgnrxnMVR3nmiB2792 | bash | Create the requested canonical skeleton and obtain its manifest. | contract-related | completed; exit=0; public-output-fingerprint | 6 | npx --no-install gennady sdd-new module --scope token --module normalize |
| 3 call_00_ET_ZZOHkQQsuAC4JKHUjqIe8624 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 2 | specs/token/normalize/normalize.spec.md |
| 4 call_01_ET_lSb98zRVrVuMfLbWgHF86608 | bash | Lexically observed operations: filesystem-discovery; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | ls specs/token &amp;&amp; ls specs/token/normalize |
| 5 call_00_SOqonfcUWcUc4XllDWOu4297 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | specs/token/token.spec.md |
| 6 call_01_MnXLBdXttT2fNDUt9Z3O4825 | bash | Lexically observed operations: filesystem-discovery; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 1 | ls ai/directives/sdd-v2/formats/ |
| 7 call_00_ET_zAsTeZhLmLNFkFaPd1Xx6780 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/entity-inventory-format.xml |
| 8 call_01_ET_dcIIuGplVX0xstAR8clx2655 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 9 | ai/directives/sdd-v2/formats/entity-surface-format.xml |
| 9 call_02_ET_Ul48oYJm3aIwAZQQBb9r9590 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/dbc-contracts.xml |
| 10 call_03_ET_joQI9q3toUDmRdrUVPUp9529 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/diagram-vocabulary.xml |
| 11 call_00_keCggbRshF1pHXLtraZF7561 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 7 | ai/directives/sdd-v2/formats/module-spec-structure.xml |
| 12 call_01_SO4oieHs0jx6lR3kn7Go5217 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 2 | ai/directives/sdd-v2/formats/requirement-entry-format.xml |
| 13 call_00_MPLM4Ar1g7Dmy7IAPVay9241 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 2 | unknown |
| 14 call_01_2wDZlAD1Q7BhmsE546Gx7764 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 1 | unknown |
| 15 call_00_wolXgNu4our9vnBXA32x0103 | bash | Unknown: retained action does not establish the information sought. | failed-attempt | completed; exit=1; public-output-fingerprint | 2 | unknown |
| 16 call_01_IuZSHnT1dtgSfPW9dISF2027 | bash | Lexically observed operations: filesystem-discovery, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | find ai -maxdepth 3 -type f &#124; head -60 |
| 17 call_00_5msGfo78mz5mDXPNPxMa2584 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 3 | unknown |
| 18 call_00_ET_6iNL0FiqAVDZe9uHHMNw3509 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 2 | unknown |
| 19 call_00_lQfSc2z67NlOouwau9Kn6641 | write | Author the declared target. | contract-related | completed; exit=unknown; public-output-fingerprint | 11 | specs/token/normalize/normalize.spec.md |
| 20 call_00_liJ0yu8wnoZANSIN79eV9983 | bash | Check the artifact; freshness and necessity of retries need preceding mutation/result facts. | review-validation | completed; exit=0; public-output-fingerprint | 7 | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring |
| 21 call_00_m57uTiBrU0aghl8CgA1k5453 | write | Author the declared target. | contract-related | completed; exit=unknown; public-output-fingerprint | 4 | specs/token/normalize/normalize.spec.md |
| 22 call_00_ET_OILyKfGwFLQAJJP6T2U53466 | bash | Check the artifact; freshness and necessity of retries need preceding mutation/result facts. | review-validation | completed; exit=0; public-output-fingerprint | 8 | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring |
| 23 call_00_QpHVFvabiybEkIgm32GQ7645 | bash | Lexically observed operations: git-observation; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | git status --short |

Read-pair candidates: 0+1 (already one message); 7+8 (already one message); 8+9 (already one message); 9+10 (already one message); 10+11 (different messages); 11+12 (already one message).

## module-nested repetition 1

Scenario: authoring-format2-oct23-module-nested-baseline-r1. Capture complete=true; omitted=0.

| Order and call ID | Tool | Information sought or operation | Assessment | Retained result | ms | Path or safe command |
|---|---|---|---|---|---:|---|
| 0 call_00_ET_3Sd7obRZrljMryJWxoZ39618 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 4 | inputs/brief.md |
| 1 call_01_ET_kZX7t2SI1StakO2CKooS1912 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 4 | ai/directives/sdd-v2/module.directive.xml |
| 2 call_00_gBAGsXUWaS7HiizawIjc2997 | bash | Create the requested canonical skeleton and obtain its manifest. | contract-related | completed; exit=0; public-output-fingerprint | 6 | npx --no-install gennady sdd-new module --scope token --module pipeline/normalize |
| 3 call_00_ET_LfbUWagM7AluzZRcldQy9169 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 3 | specs/token/pipeline/normalize/normalize.spec.md |
| 4 call_00_Bq21rs1Iqgt5Tlvpp8gS8328 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 1 | unknown |
| 5 call_01_9WLJinAUEUI6eJ4b4Cdn3979 | bash | Lexically observed operations: git-observation; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | git status --short &amp;&amp; git log --oneline -5 |
| 6 call_00_ET_zvSYGOhQBFlEEcAal6eK2295 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 2 | specs/token/token.spec.md |
| 7 call_01_ET_SLWcKzQwTQRbszR8K19y3418 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 7 | ai/directives/sdd-v2/formats/entity-inventory-format.xml |
| 8 call_00_ET_nxkaO9mPf9MuPGKPt6gl8636 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/entity-surface-format.xml |
| 9 call_01_ET_bPdbSZg5xw87jdQuU7967260 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/dbc-contracts.xml |
| 10 call_00_g36pMLBWEd7DyJH7A4Lm4612 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 4 | ai/directives/sdd-v2/formats/diagram-vocabulary.xml |
| 11 call_01_q5I7nEix0BumuG32MoY92279 | bash | Lexically observed operations: text-search, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | grep -rn "DECISION_LOG_ENTRY_FORMAT" ai/directives/sdd-v2 &#124; head -20 |
| 12 call_00_c3kPCoK5SQQ0pxvwgsmw1551 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/module-spec-structure.xml |
| 13 call_01_hjrumRLTgNiClU274N6D8163 | bash | Lexically observed operations: shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 11 | sed -n '595,640p' ai/directives/sdd-v2/root.directive.xml |
| 14 call_00_gB23JxwyyEH0Spp8XWhs5203 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 2 | unknown |
| 15 call_01_m9UP9jJD32QKeipOsa0B9710 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 1 | unknown |
| 16 call_00_OBODosUvyyQPKADxDASE1697 | bash | Lexically observed operations: shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 1 | sed -n '190,235p' ai/directives/sdd-v2/scaffold.directive.xml |
| 17 call_01_wmq57r9DnD8Om5yL8wQd6476 | bash | Lexically observed operations: text-search, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | grep -rn "NO_ASCII\&#124;NON_ASCII\&#124;acronym\&#124;ACR" ai/directives/sdd-v2/*.xml ai/directives/sdd-v2/formats/*.xml &#124; head -40 |
| 18 call_00_fShwVEuizIj1bxR5Flld8776 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 4 | ai/directives/sdd-v2/formats/requirement-entry-format.xml |
| 19 call_01_ruGCZ5qYw99y6fyUajMI9148 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 2 | unknown |
| 20 call_00_eoFKmzQcCV2xOdaizUDR2738 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 2 | unknown |
| 21 call_01_6ToZ3yXohvxgxMDGLwhm2355 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 2 | unknown |
| 22 call_00_OWDAccacVyT4Rg42eBe43736 | write | Author the declared target. | contract-related | completed; exit=unknown; public-output-fingerprint | 8 | specs/token/pipeline/normalize/normalize.spec.md |
| 23 call_00_d9lkwz4bniaQg53Wndpo2362 | bash | Check the artifact; freshness and necessity of retries need preceding mutation/result facts. | review-validation | completed; exit=0; public-output-fingerprint | 6 | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring |
| 24 call_00_5Yj1LXEzKTcIP4TEiLFP7498 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 3 | specs/token/pipeline/normalize/normalize.spec.md |
| 25 call_00_SjOv81PZEIbwzhnA45645250 | write | Author the declared target. | contract-related | completed; exit=unknown; public-output-fingerprint | 4 | specs/token/pipeline/normalize/normalize.spec.md |
| 26 call_00_tRQLfR0gu7W82t8QKd581905 | bash | Check the artifact; freshness and necessity of retries need preceding mutation/result facts. | review-validation | completed; exit=0; public-output-fingerprint | 7 | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring |
| 27 call_00_wixSFJNFRUzA6IfHqsC42621 | bash | Lexically observed operations: git-observation; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 12 | git status --short &amp;&amp; git diff --stat |
| 28 call_00_QYSxyXxsLxJkcUSgkJ294857 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 10 | unknown |
| 29 call_01_QbI5IEc4UVusr9G1FZ1H5449 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 1 | unknown |

Read-pair candidates: 0+1 (already one message); 6+7 (already one message); 7+8 (different messages); 8+9 (already one message); 9+10 (different messages).

## module-flat repetition 2

Scenario: authoring-format2-oct23-module-flat-baseline-r2. Capture complete=true; omitted=0.

| Order and call ID | Tool | Information sought or operation | Assessment | Retained result | ms | Path or safe command |
|---|---|---|---|---|---:|---|
| 0 call_00_arWoVJq3p4Fp1b5UBmGo8116 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 3 | inputs/brief.md |
| 1 call_01_qhhb5Q5bNMZ6vxYhKjv98204 | bash | Lexically observed operations: filesystem-discovery; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 3 | ls -la . |
| 2 call_00_ET_7029Rvc32Ra4KTVPxNRo4609 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 6 | ai/directives/sdd-v2/module.directive.xml |
| 3 call_01_ET_E0mH8OxsenOH2OC96glU2864 | bash | Lexically observed operations: filesystem-discovery; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | find ./specs ./docs ./ai -type f &#124; sort |
| 4 call_00_I6Ex25g770JUOiSkoeow9416 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 10 | specs/token/token.spec.md |
| 5 call_01_1PVOmFViRCeEEYkzQTYp3344 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | docs/token-contract.md |
| 6 call_00_GuqoUdM7UkNTCbXyUO0B4895 | bash | Create the requested canonical skeleton and obtain its manifest. | contract-related | completed; exit=0; public-output-fingerprint | 8 | npx --no-install gennady sdd-new module --scope token --module normalize |
| 7 call_00_ET_YqOyyM4jVuYiZ73kT0rY6267 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 4 | specs/token/normalize/normalize.spec.md |
| 8 call_00_lXBCjP2sLTSdB61lCqGL8183 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 9 | ai/directives/sdd-v2/formats/entity-inventory-format.xml |
| 9 call_01_9OtnPLjxnfkKRJrj7t9s5830 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 5 | ai/directives/sdd-v2/formats/entity-surface-format.xml |
| 10 call_02_Jo1odWTex5Ulvsdv1ELS5061 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 6 | ai/directives/sdd-v2/formats/dbc-contracts.xml |
| 11 call_03_zAnu1R8PbxKHNdAiRHrW6437 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 10 | ai/directives/sdd-v2/formats/diagram-vocabulary.xml |
| 12 call_00_dMVbvcTCTwCFTe0lZNns6150 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 4 | ai/directives/sdd-v2/formats/requirement-entry-format.xml |
| 13 call_01_aqKzKkMv2339fOwuMCKp7254 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 71 | ai/directives/sdd-v2/formats/module-spec-structure.xml |
| 14 call_00_SNO6lgKd81BCRNlAXOxo0942 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 4 | specs/README.md |
| 15 call_01_e2VHVfWoIJgVPoOeufV74221 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | package.json |
| 16 call_02_FXWJWHJ6UMasa7spzyKL6242 | bash | Lexically observed operations: filesystem-discovery; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | find ./specs -maxdepth 3 -type d &#124; sort |
| 17 call_00_mul7bOpDi987SpxZAKy84485 | grep | Find paths or matching text; pattern/results may not be retained. | review-discovery | completed; exit=unknown; public-output-fingerprint | 35 | unknown |
| 18 call_01_sbM3wKio7zBTnRhSpFF26554 | grep | Find paths or matching text; pattern/results may not be retained. | review-discovery | completed; exit=unknown; public-output-fingerprint | 13 | unknown |
| 19 call_00_ITJKuESCKbTCCceHpiCH4508 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/skills/sdd/SKILL.md |
| 20 call_01_xDvtUeImaSXweSpOca4D1813 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | specs/infra-base/infra-base.spec.md |
| 21 call_00_NPJTKoFV640vc5sQEW4c9966 | bash | Lexically observed operations: text-search, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 3 | rg -n "REQ-.*ACR&#124;acronym&#124;SPEC_ID&#124;token-acr&#124;ACR" ai/directives/sdd-v2 --glob '*.xml' &#124; head -80 |
| 22 call_00_rzWkXeHYuAAvMrS52Ozz1185 | write | Author the declared target. | contract-related | completed; exit=unknown; public-output-fingerprint | 8 | specs/token/normalize/normalize.spec.md |
| 23 call_00_3NjBDJ5AdjDOStle3IDE6259 | bash | Check the artifact; freshness and necessity of retries need preceding mutation/result facts. | review-validation | completed; exit=0; public-output-fingerprint | 13 | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring |
| 24 call_00_7otoo5NCylzhCPFQES5q5055 | write | Author the declared target. | contract-related | completed; exit=unknown; public-output-fingerprint | 4 | specs/token/normalize/normalize.spec.md |
| 25 call_01_hbF0E9k27sXgGx3uq1s02221 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 3 | specs/token/normalize/normalize.spec.md |
| 26 call_00_ATbkptI9pIopV2AGBA5C7414 | bash | Check the artifact; freshness and necessity of retries need preceding mutation/result facts. | review-validation | completed; exit=0; public-output-fingerprint | 8 | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring |
| 27 call_00_6mY5ENrHIoaHbc0Th8ag9017 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 3 | specs/token/normalize/normalize.spec.md |
| 28 call_00_vstpKGZ76xMlOY3rUYTO0324 | bash | Lexically observed operations: git-observation; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 15 | git status --short &amp;&amp; git diff --stat |

Read-pair candidates: 4+5 (already one message); 7+8 (different messages); 8+9 (already one message); 9+10 (already one message); 10+11 (already one message); 11+12 (different messages); 12+13 (already one message); 13+14 (different messages); 14+15 (already one message); 19+20 (already one message).

## module-nested repetition 2

Scenario: authoring-format2-oct23-module-nested-baseline-r2. Capture complete=true; omitted=0.

| Order and call ID | Tool | Information sought or operation | Assessment | Retained result | ms | Path or safe command |
|---|---|---|---|---|---:|---|
| 0 call_00_ttqR7PtgpA7VGlkrhCeE0214 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 3 | inputs/brief.md |
| 1 call_01_LTicFF8wnClh4QkMiaZ55687 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/module.directive.xml |
| 2 call_00_LI0Naj372iGAliYWx4GP4659 | bash | Create the requested canonical skeleton and obtain its manifest. | contract-related | completed; exit=0; public-output-fingerprint | 7 | npx --no-install gennady sdd-new module --scope token --module pipeline/normalize |
| 3 call_00_XYEDEteFdj2WH4Mpw7tf6923 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 3 | specs/token/pipeline/normalize/normalize.spec.md |
| 4 call_01_zFu2buEAA033pFLFIHio1034 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 1 | unknown |
| 5 call_00_U94bYJunCp3PIXtuhSaX3681 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | specs/token/token.spec.md |
| 6 call_01_79pYpkT5nVJsU8Qfix188666 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 2 | unknown |
| 7 call_00_5YtZqwDtMjQkaqYlzMzu7693 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/entity-inventory-format.xml |
| 8 call_01_lerOP5j8CVCCdqY65sAo8473 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/entity-surface-format.xml |
| 9 call_02_EiKHaahav3Kt0ojrhuov4259 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/dbc-contracts.xml |
| 10 call_03_H0KgWebCbtZjrrxwAHqO6577 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 2 | ai/directives/sdd-v2/formats/diagram-vocabulary.xml |
| 11 call_04_Y6wui8xzhCsUQJqsNNHd0110 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 7 | ai/directives/sdd-v2/formats/requirement-entry-format.xml |
| 12 call_00_Qm7lhaISAQIbzwsQj2CL1234 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 7 | ai/directives/sdd-v2/formats/module-spec-structure.xml |
| 13 call_01_WHur0QbQe1EoQH0tFoLx4853 | bash | Lexically observed operations: text-search; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | grep -rl "DECISION_LOG_ENTRY_FORMAT" ai/ &#124; sort |
| 14 call_00_aiJe4iyn0u066HdXZwxF3421 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 2 | unknown |
| 15 call_00_8slqwZ88ihqPFbnmhaHM4945 | bash | Lexically observed operations: shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | sed -n '500,560p' ai/directives/sdd-v2/root.directive.xml |
| 16 call_00_Zoyp25bYwzODmcuGI5P22707 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 2 | unknown |
| 17 call_00_MBQpMrViCqt0g9pI4aKK4152 | write | Author the declared target. | contract-related | completed; exit=unknown; public-output-fingerprint | 8 | specs/token/pipeline/normalize/normalize.spec.md |
| 18 call_00_I9yaz9RpCXnWSU2z27vN2650 | bash | Check the artifact; freshness and necessity of retries need preceding mutation/result facts. | review-validation | completed; exit=0; public-output-fingerprint | 7 | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring |
| 19 call_00_miKj3UffFnAKi2DHBorV6543 | write | Author the declared target. | contract-related | completed; exit=unknown; public-output-fingerprint | 5 | specs/token/pipeline/normalize/normalize.spec.md |
| 20 call_00_ET_7Ntp0CSB1qlLMZYk5NAb1808 | bash | Check the artifact; freshness and necessity of retries need preceding mutation/result facts. | review-validation | completed; exit=0; public-output-fingerprint | 7 | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring |
| 21 call_00_IesMlWr5LtnP3OxAl5iT8920 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 12 | unknown |

Read-pair candidates: 0+1 (already one message); 7+8 (already one message); 8+9 (already one message); 9+10 (already one message); 10+11 (already one message); 11+12 (different messages).

## module-flat repetition 3

Scenario: authoring-format2-oct23-module-flat-baseline-r3. Capture complete=true; omitted=0.

| Order and call ID | Tool | Information sought or operation | Assessment | Retained result | ms | Path or safe command |
|---|---|---|---|---|---:|---|
| 0 call_00_1TYsmmO3S31Gq7NZAGcX8343 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 11 | inputs/brief.md |
| 1 call_01_SYfMqmw4OsLmXWdtj1cI8107 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/module.directive.xml |
| 2 call_00_Jya4a9gmr9F7DNrhW7m69193 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 2 | unknown |
| 3 call_01_UtuH8w2Bzxw0n6hUtdCb2773 | bash | Lexically observed operations: git-observation; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | git status --porcelain &amp;&amp; git log --oneline -5 |
| 4 call_00_qJ2YxJFotA1mHae9qmHv5855 | bash | Lexically observed operations: filesystem-discovery; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | find specs -type f -maxdepth 4 -print |
| 5 call_01_mtjCBnyVSCnTm8rH2svk7983 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 4 | specs/README.md |
| 6 call_00_ZYAuP4bngibaSu5Tvs8t9908 | bash | Create the requested canonical skeleton and obtain its manifest. | contract-related | completed; exit=0; public-output-fingerprint | 6 | npx --no-install gennady sdd-new module --scope token --module normalize |
| 7 call_00_ET_lUMmo80GlCHkT6sgKb6R2539 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 3 | specs/token/normalize/normalize.spec.md |
| 8 call_01_ET_l4zgFQZyPUBbyelbYzLp1952 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 7 | specs/token/token.spec.md |
| 9 call_00_lHF8wRlnAPeyqt7LhzQS3998 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/entity-inventory-format.xml |
| 10 call_01_Mx4SS8ep1EBUdPb8jMqZ4021 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/entity-surface-format.xml |
| 11 call_02_upKtrnxtfpYcOn69sTVD2377 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/dbc-contracts.xml |
| 12 call_03_7hDelF2cM9FLkwkS3wjj1401 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/diagram-vocabulary.xml |
| 13 call_00_FdwT2uaWbGVkf6fIvk7a3960 | bash | Lexically observed operations: filesystem-discovery; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | ls ai/directives/sdd-v2/formats |
| 14 call_01_JCsqpg1EzCVhklM46UEi6494 | read | Read reference/instruction context; relevance is observable, necessity needs review. | failed-attempt | error; exit=unknown; terminal-facts-only | 3 | ai/directives/sdd-v2/formats/decision-log-format.xml |
| 15 call_00_1rAQsfu88EtJVRCumGlF6852 | bash | Lexically observed operations: text-search, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 1 | rg -n "DECISION_LOG_ENTRY_FORMAT" ai &#124; head -20 |
| 16 call_01_yA9oCRByrcUvohfArDpx4368 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 2 | ai/directives/sdd-v2/formats/module-spec-structure.xml |
| 17 call_00_21eIJnSq4DF6Gowcq4hZ4329 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/root.directive.xml |
| 18 call_00_7yaUZbSLfm7NmgOjIGzQ6154 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 2 | unknown |
| 19 call_01_SAQDv2Wkgbz0N76FepCS0698 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/requirement-entry-format.xml |
| 20 call_00_WJ7Dvky86QnXxfn9OlvT6754 | bash | Lexically observed operations: filesystem-discovery, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | find docs -type f -maxdepth 5 -print &amp;&amp; cat package.json |
| 21 call_01_1Rw8Clcb5Ob1t3vzoPBo6347 | bash | Lexically observed operations: text-search; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 4 | rg -n "normalize-example&#124;empty-input-rejection&#124;Foo__BAR" . --glob '!node_modules/**' --glob '!.git/**' |
| 22 call_00_ET_Nhtlmjoc9S1YRgORLuAJ1444 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 2 | docs/token-contract.md |
| 23 call_01_ET_km2fAr8QWe0PHgbkLj4n6969 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 2 | unknown |
| 24 call_00_QvdWBdQMuyNnwPOG8Geu7885 | bash | Lexically observed operations: text-search, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 7 | rg -n "SPEC_ID&#124;acronym&#124;ACR" ai/directives/sdd-v2/root.directive.xml ai/directives/sdd-v2/module.directive.xml ai/directives/sdd-v2/formats/*.xml &#124; head -40 |
| 25 call_01_RGdsqEp45BNwHhaMXg1E1010 | bash | Lexically observed operations: text-search, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | rg -n "SPEC_ID&#124;acronym" ai/directives/sdd-v2/scaffold.directive.xml ai/directives/sdd-v2/scope.directive.xml &#124; head -30 |
| 26 call_00_In7eOpteLhZQxbGKgjvF4165 | write | Author the declared target. | contract-related | completed; exit=unknown; public-output-fingerprint | 8 | specs/token/normalize/normalize.spec.md |
| 27 call_00_f7IRdaFpBBcuEY5WCLMC9297 | bash | Check the artifact; freshness and necessity of retries need preceding mutation/result facts. | review-validation | completed; exit=0; public-output-fingerprint | 6 | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring |
| 28 call_00_ecHAlrpLshSY9WD0CGzm5504 | write | Author the declared target. | contract-related | completed; exit=unknown; public-output-fingerprint | 10 | specs/token/normalize/normalize.spec.md |
| 29 call_00_ET_dFVyLr5SD5xGjNsn5PiK2859 | bash | Check the artifact; freshness and necessity of retries need preceding mutation/result facts. | review-validation | completed; exit=0; public-output-fingerprint | 4 | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring |
| 30 call_00_vhbIu5SVdXRr3zxaMDuz5671 | bash | Lexically observed operations: git-observation; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 11 | git status --porcelain &amp;&amp; git diff --stat |

Read-pair candidates: 0+1 (already one message); 7+8 (already one message); 8+9 (different messages); 9+10 (already one message); 10+11 (already one message); 11+12 (already one message); 16+17 (different messages).

## module-nested repetition 3

Scenario: authoring-format2-oct23-module-nested-baseline-r3. Capture complete=true; omitted=0.

| Order and call ID | Tool | Information sought or operation | Assessment | Retained result | ms | Path or safe command |
|---|---|---|---|---|---:|---|
| 0 call_00_ET_M2gKiDgIu8d0ovVwTKaa5408 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 8 | inputs/brief.md |
| 1 call_01_ET_NdsZRpumMdvMaaSDSg0e9512 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/module.directive.xml |
| 2 call_00_wXuoNfLqJRKvoR2tLmZa5760 | bash | Create the requested canonical skeleton and obtain its manifest. | contract-related | completed; exit=0; public-output-fingerprint | 5 | npx --no-install gennady sdd-new module --scope token --module pipeline/normalize |
| 3 call_00_ET_O9w3ksiowcH9NsS5IKRG2026 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 3 | specs/token/pipeline/normalize/normalize.spec.md |
| 4 call_01_ET_zHiJK6dHGk8XFGxjZ4mg9642 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 1 | unknown |
| 5 call_00_Dc4IMti5aw5TcKSyiMWL2986 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | specs/token/token.spec.md |
| 6 call_01_ASqlWyT6Vh6Lhsp7vtB75703 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 2 | ai/directives/sdd-v2/formats/entity-inventory-format.xml |
| 7 call_02_FHxtkpIzY0N5oLm6fGe75080 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/entity-surface-format.xml |
| 8 call_03_QSvqc8BnC8OTXTQCdqew7745 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/dbc-contracts.xml |
| 9 call_00_Y46rYK0ymXow1JOEacJ14898 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/requirement-entry-format.xml |
| 10 call_01_o2RK20ZOzVmH1sMerprQ2937 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 8 | ai/directives/sdd-v2/formats/diagram-vocabulary.xml |
| 11 call_00_wNkxDbkg01FcNs1979C90153 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 2 | unknown |
| 12 call_00_g9HfTkEhIeO6jWCfbLqX4858 | bash | Lexically observed operations: filesystem-discovery, git-observation; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | ls -R docs; git log --oneline -5 |
| 13 call_01_T8HcFGIiLEbz6qwTW2JY7026 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 4 | ai/directives/sdd-v2/formats/module-spec-structure.xml |
| 14 call_00_RRp3d5A70MeCP54Q3gJ85991 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | docs/token-contract.md |
| 15 call_01_gVy4ZHvTeTSWFXoSE1jy3901 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 4 | ai/directives/sdd-v2/formats/module-diagram-ladder.example.md |
| 16 call_00_oOTAgWmvt60gdFx7sesm1761 | bash | Lexically observed operations: text-search, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 3 | rg -n "acronym&#124;ACR&#124;SPEC_ID&#124;module.*REQ" ai/directives/sdd-v2 --glob '*.xml' &#124; head -80 |
| 17 call_00_pwFrCoawmYk1VvrFh4yf8071 | bash | Lexically observed operations: text-search, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 3 | rg -n "SPEC_ID&#124;acronym&#124;require.*ID&#124;REQ-" ai/directives/sdd-v2/audit/steps/STEP_1_MECHANICAL.xml ai/directives/sdd-v2/root.directive.xml &#124; head -120 |
| 18 call_00_VBoseniVtfUqkKyban4k0472 | bash | Lexically observed operations: shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | sed -n '500,535p' ai/directives/sdd-v2/root.directive.xml |
| 19 call_00_BM9KpDPN9wQJ1R384GUR3283 | bash | Lexically observed operations: shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | cat package.json |
| 20 call_00_ku02Ch4mjQu2WTdCcY004178 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 1 | unknown |
| 21 call_00_jaHyAYfjnovTCJQ5r3Ij1159 | write | Author the declared target. | contract-related | completed; exit=unknown; public-output-fingerprint | 9 | specs/token/pipeline/normalize/normalize.spec.md |
| 22 call_00_E64Pi0DyaS5O1G2jc4HY0789 | bash | Check the artifact; freshness and necessity of retries need preceding mutation/result facts. | review-validation | completed; exit=0; public-output-fingerprint | 7 | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring |
| 23 call_00_b5ISArhebsP5NX6jbPS08795 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 8 | specs/token/pipeline/normalize/normalize.spec.md |
| 24 call_00_hAyA6oMRb7m7tonGzhA01411 | write | Author the declared target. | contract-related | completed; exit=unknown; public-output-fingerprint | 8 | specs/token/pipeline/normalize/normalize.spec.md |
| 25 call_00_ET_EdNcTVcKF0IWWvrG5fZj4460 | bash | Check the artifact; freshness and necessity of retries need preceding mutation/result facts. | review-validation | completed; exit=0; public-output-fingerprint | 6 | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring |
| 26 call_00_UAlfVMfy9bUWtPhsVsU67374 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 14 | unknown |

Read-pair candidates: 0+1 (already one message); 5+6 (already one message); 6+7 (already one message); 7+8 (already one message); 8+9 (different messages); 9+10 (already one message); 13+14 (different messages); 14+15 (already one message).

## Interpretation boundaries

- Contract-related means the requested operation, not a proof of its minimality or successful information transfer.
- No tool output body or private reasoning is reconstructed. Historical output/ranges remain unknown.
- Lexical shell roles can overlap; shell payloads stay withheld. A compound exit is not per-subcommand evidence.
- Adjacent pairs overlap: do not add them into a claimed number of removable calls.
- A saved millisecond interval is tool runtime, not its counterfactual wall-time cost or provider round trip.
- Zero proven unnecessary calls means no causal removal experiment, not that all calls were necessary.

Next: annotate candidate usefulness against real results; test one removal or batching change at a time. No historical grade changes.
