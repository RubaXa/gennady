# Authoring call audit

Frozen source 7f3656672f18463044a9d84706b5d3c4de4d031c; input SHA-256 024f6bbe5643ace979e8efd16fe5d500fdd5c6cb198e60fd5e98a1d7265b0ff1.

Runs=6; calls=157; complete-timed=157.
Result fingerprints=157; failure diagnostics=0; terminal facts only=0.
Adjacent read pairs=36; already same message=31; across messages=5. Overlapping candidates, not additive savings.

Worker wall sum ms=523041; observed assistant messages=113; union of per-run tool intervals ms=792.
Tool timestamps do not allocate remaining time to inference, queueing, network, capture or other overhead.

No necessity/causality score is inferred. Read “contract-related” as justified operation class, not proof that every read or retry was needed.
Returned content, hidden motives and shell subcommand outcomes are not reconstructed. Reflection remains separately archived self-report, not an explanation certified by this table.

## module-flat repetition 1

Scenario: authoring-format2-oct23-module-flat-pseudocode-r1. Capture complete=true; omitted=0.

| Order and call ID | Tool | Information sought or operation | Assessment | Retained result | ms | Path or safe command |
|---|---|---|---|---|---:|---|
| 0 call_00_ET_7LTbu0eTRSKFghFw8f5k9633 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 2 | inputs/brief.md |
| 1 call_01_ET_vlvOdn3SRMoqz7RGGttc3102 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/module.directive.xml |
| 2 call_00_0kmMj6c8orpNReNijtPE4997 | bash | Create the requested canonical skeleton and obtain its manifest. | contract-related | completed; exit=0; public-output-fingerprint | 6 | npx --no-install gennady sdd-new module --scope token --module normalize |
| 3 call_00_ET_wQYhi6MqMl7yfzzlGL5x4122 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 3 | specs/token/normalize/normalize.spec.md |
| 4 call_00_FgRWWvi0oVQedSsIU8go2720 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 1 | unknown |
| 5 call_00_ET_VwmdUBYjcM1cjWhYempj7120 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 4 | specs/token/token.spec.md |
| 6 call_01_ET_5nC92uZi0RiVtnUYg2Br6342 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/entity-inventory-format.xml |
| 7 call_02_ET_NdcQ4MaOBJLwJ0SaKaqZ6701 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 4 | ai/directives/sdd-v2/formats/entity-surface-format.xml |
| 8 call_03_ET_DqB3MDniHB5V9ySE8DAI6368 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/dbc-contracts.xml |
| 9 call_00_h5XFqguRXva0iCSpw17t5714 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 2 | ai/directives/sdd-v2/formats/diagram-vocabulary.xml |
| 10 call_01_Tfq8t4HpStDTCNTqZPg56967 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/module-spec-structure.xml |
| 11 call_02_25sNheZnyU81ujrSlbyy7824 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/requirement-entry-format.xml |
| 12 call_00_zoYaQ7oB6PBkqdWdLV1t6626 | bash | Lexically observed operations: text-search, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | rg -n "SPEC_ID&#124;ACR&#124;acronym&#124;MODULE_REQUIREMENTS" ai/directives/sdd-v2 --glob '*.xml' &#124; head -80 |
| 13 call_00_JaZC2pORPnWk7CjKzoJg3846 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 1 | unknown |
| 14 call_01_qH7ttUURgsK9NKsQPBFS0442 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 4 | specs/README.md |
| 15 call_00_ET_lkSfIIy97vLDyCzRssKq1302 | bash | Lexically observed operations: shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | cat package.json; cat AGENTS.md |
| 16 call_01_ET_WorFJ924gAjFtBmShm7h4023 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | specs/infra-base/infra-base.spec.md |
| 17 call_00_2FN3ICF6Ub4FJAd7SIh78558 | write | Author the declared target. | contract-related | completed; exit=unknown; public-output-fingerprint | 12 | specs/token/normalize/normalize.spec.md |
| 18 call_00_ET_uoGwi5sjywbGKj8aniMY0718 | bash | Check the artifact; freshness and necessity of retries need preceding mutation/result facts. | review-validation | completed; exit=0; public-output-fingerprint | 7 | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring |
| 19 call_00_HdEgL1QNUZBsDFcEMJVu1028 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 40 | unknown |
| 20 call_00_GU4S8tP5udGtVdqmLw5E3434 | bash | Check the artifact; freshness and necessity of retries need preceding mutation/result facts. | review-validation | completed; exit=0; public-output-fingerprint | 7 | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring |
| 21 call_00_K2Hauj9IetbuTWayfouF4652 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 2 | unknown |

Read-pair candidates: 0+1 (already one message); 5+6 (already one message); 6+7 (already one message); 7+8 (already one message); 8+9 (different messages); 9+10 (already one message); 10+11 (already one message).

## module-nested repetition 1

Scenario: authoring-format2-oct23-module-nested-pseudocode-r1. Capture complete=true; omitted=0.

| Order and call ID | Tool | Information sought or operation | Assessment | Retained result | ms | Path or safe command |
|---|---|---|---|---|---:|---|
| 0 call_00_ET_QJ1sFjKT4cowLTfa5rqp9277 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 8 | inputs/brief.md |
| 1 call_01_ET_Uod71GfCuwD2QOgD9u378771 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 1 | unknown |
| 2 call_00_ET_xXUJPV1JhB4F1zwmdxfW0247 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 2 | ai/directives/sdd-v2/module.directive.xml |
| 3 call_00_yfS4FNuvFawO6JKuryC69263 | bash | Create the requested canonical skeleton and obtain its manifest. | contract-related | completed; exit=0; public-output-fingerprint | 5 | npx --no-install gennady sdd-new module --scope token --module pipeline/normalize |
| 4 call_00_cXglYFDoBy0Tu30kqvlm7754 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 7 | specs/token/pipeline/normalize/normalize.spec.md |
| 5 call_01_LHP8aawzUPlUzBI9nheu8046 | bash | Lexically observed operations: filesystem-discovery; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | find specs -maxdepth 4 -type f &#124; sort |
| 6 call_00_92jwp2kWZfk3KyOnCPIx5017 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | specs/token/token.spec.md |
| 7 call_01_3MMBf2nghZw7uTmf6XLz5526 | bash | Lexically observed operations: filesystem-discovery; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 1 | ls ai/directives/sdd-v2/formats |
| 8 call_00_gU7akmwb3LKiNROckgxt6468 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 2 | ai/directives/sdd-v2/formats/entity-inventory-format.xml |
| 9 call_01_VLdJN38k2ItV7zcqHQYC7242 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/entity-surface-format.xml |
| 10 call_02_prqIrZKhUTzinCzFYOH26963 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/dbc-contracts.xml |
| 11 call_03_li4e8aRsa8YbfjK3z5Qd0910 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/diagram-vocabulary.xml |
| 12 call_00_e6rw87dyvW3stemcu5L81193 | bash | Lexically observed operations: text-search, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 1 | rg -l "DECISION_LOG_ENTRY_FORMAT&#124;REQUIREMENT_ENTRY_FORMAT" ai/directives/sdd-v2 &#124; head -20 |
| 13 call_01_ny3pDfmtyvfVtZ8MipeK5925 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/requirement-entry-format.xml |
| 14 call_00_SxOYfyel4OlGgqHJzEwx0742 | bash | Unknown: retained action does not establish the information sought. | failed-attempt | completed; exit=1; public-output-fingerprint | 12 | unknown |
| 15 call_00_ET_7f4usQKwNP2i8ygGarsv7011 | bash | Lexically observed operations: text-search, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 10 | rg -n -B2 -A35 'DECISION_LOG_ENTRY_FORMAT' ai/directives/sdd-v2/root.directive.xml &#124; head -100 |
| 16 call_00_inlNsSMYfX0fD2YeVpTb2374 | bash | Lexically observed operations: text-search, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 3 | rg -n "ACR&#124;acronym&#124;module acronym&#124;REQUIREMENTS" ai/directives/sdd-v2/formats/module-spec-structure.xml &#124; head -60 |
| 17 call_00_Zh73NbOmNsaknPZ80GMF5478 | bash | Lexically observed operations: text-search, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | rg -n "REQ-&#124;DL-&#124;acronym&#124;ACR" specs docs ai/directives/sdd-v2/guides &#124; head -60 |
| 18 call_00_yWj2ePcoClaUizjZtQmb9934 | bash | Lexically observed operations: text-search, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | rg -n "no sibling&#124;No sibling&#124;INTER_MODULE&#124;dependency graph&#124;Depends on" ai/directives/sdd-v2/formats/module-spec-structure.xml ai/directives/sdd-v2/*.xml &#124; head -40 |
| 19 call_00_WbiZojfTMPIx1SWGEXQK9019 | bash | Lexically observed operations: filesystem-discovery, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 1 | cat package.json; find . -maxdepth 2 -type d -name 'src' -o -name 'lib' -o -name 'test' &#124; sort; ls docs ai/directives &#124; head -40 |
| 20 call_00_xf9lfetZkJ0yM5NBIA5J4369 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | docs/token-contract.md |
| 21 call_00_GvHWhv9TInMi1GlK7oMp0536 | bash | Lexically observed operations: filesystem-discovery; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | ls ai/directives/coding ai/directives/testing; ls ai/directives/sdd-v2/guides |
| 22 call_00_ahogzQMEfInbIBzqLL2a1451 | bash | Lexically observed operations: text-search, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | rg -n "src/&#124;\.ts&#124;typescript&#124;vitest&#124;node-test" AGENTS.md specs docs ai/directives/sdd-v2/guides &#124; head -40 |
| 23 call_00_m1yLZ0UDfXTALylEaqWt1604 | write | Author the declared target. | contract-related | completed; exit=unknown; public-output-fingerprint | 8 | specs/token/pipeline/normalize/normalize.spec.md |
| 24 call_00_wkJklDK50oWYenNMyhrT4746 | bash | Check the artifact; freshness and necessity of retries need preceding mutation/result facts. | review-validation | completed; exit=0; public-output-fingerprint | 9 | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring |
| 25 call_00_fJ1KFauRgsIzbTi1CWG59539 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 9 | specs/token/pipeline/normalize/normalize.spec.md |
| 26 call_00_ET_2Y12QWAMeJN2OjPbfGF49343 | write | Author the declared target. | contract-related | completed; exit=unknown; public-output-fingerprint | 4 | specs/token/pipeline/normalize/normalize.spec.md |
| 27 call_00_ET_wWyjOBD64A0ofrOzHwz27590 | bash | Check the artifact; freshness and necessity of retries need preceding mutation/result facts. | review-validation | completed; exit=0; public-output-fingerprint | 8 | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring |
| 28 call_00_J5Ul5c0ZP0c4pYYEONAY2209 | bash | Lexically observed operations: git-observation; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | git status --short |

Read-pair candidates: 8+9 (already one message); 9+10 (already one message); 10+11 (already one message).

## module-flat repetition 2

Scenario: authoring-format2-oct23-module-flat-pseudocode-r2. Capture complete=true; omitted=0.

| Order and call ID | Tool | Information sought or operation | Assessment | Retained result | ms | Path or safe command |
|---|---|---|---|---|---:|---|
| 0 call_00_2SerspUEYGdKme0YJNmk8016 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 7 | inputs/brief.md |
| 1 call_00_xUmXsa9QGKdKkWPBffQP2845 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/module.directive.xml |
| 2 call_01_WCWTEytfiLVa7bwLdEsB1403 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 1 | unknown |
| 3 call_00_HAqlrmjWMsLiM92pAkU21874 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 14 | unknown |
| 4 call_00_AqzqlV8aTIBPlkcM9XBw8917 | bash | Lexically observed operations: creation-or-metadata; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 5 | cd . &amp;&amp; npx --no-install gennady sdd-new module --scope token --module normalize |
| 5 call_00_eShQKC3GyubsPVYKJn3H6765 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 3 | specs/token/normalize/normalize.spec.md |
| 6 call_01_Ddo2c0ivZ4TmYcvCtieE1213 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 6 | specs/token/token.spec.md |
| 7 call_00_H6joRQzae7MTyPGPgkul5813 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/entity-inventory-format.xml |
| 8 call_01_iY2QLewzAa6VrnqW3mOY0804 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/entity-surface-format.xml |
| 9 call_02_Rh8DW8jcelNYpddbZHH08556 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/dbc-contracts.xml |
| 10 call_03_tTwZdIDJwgRQUl2Ww4Bu5749 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 7 | ai/directives/sdd-v2/formats/diagram-vocabulary.xml |
| 11 call_00_m828ADeYaXbBgdRNqUhk0733 | bash | Lexically observed operations: text-search, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | cd . &amp;&amp; grep -rn "ACR" ai/directives/sdd-v2 --include=*.xml &#124; head -40 |
| 12 call_00_ET_vJEGH1hvyYz71Yvise2f0105 | bash | Lexically observed operations: text-search, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 5 | cd . &amp;&amp; grep -rn "ACR" ai/directives/sdd-v2 &#124; head -50 |
| 13 call_00_tdw4aqo5uHJa5jGtOSMQ5074 | bash | Lexically observed operations: text-search, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | cd . &amp;&amp; grep -rni "acronym" ai/directives &#124; head -40 |
| 14 call_00_ET_8gGJyOK1H7OPlazESwRP3575 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/requirement-entry-format.xml |
| 15 call_00_mrvXafXUZA02cNkjjP8p4873 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 2 | unknown |
| 16 call_00_U8SjbUZD9UETR1x5wuhw6749 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 2 | unknown |
| 17 call_00_4MIdRFCNCXC3VQKWgaJ09456 | bash | Lexically observed operations: text-search, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 13 | cd . &amp;&amp; grep -rn "SPEC_ID\&#124;spec id\&#124;Spec ID\&#124;module acronym\&#124;module name" ai/directives/sdd-v2/scope.directive.xml ai/directives/sdd-v2/root.directive.xml ai/directives/sdd-v2/infra.directive.xml &#124; head -50 |
| 18 call_00_8vQVWNM9TFHp2g7kEDWA8335 | bash | Lexically observed operations: text-search, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 13 | cd . &amp;&amp; grep -rn "REQ-" ai/directives/sdd-v2/audit ai/directives/sdd-v2/*.xml &#124; grep -i "module\&#124;NORM\&#124;TOK" &#124; head -30 |
| 19 call_00_Myu5z330LOAq5TPua5Mu4395 | bash | Lexically observed operations: filesystem-discovery; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | cd . &amp;&amp; ls ai/directives/testing &amp;&amp; ls ai/directives/coding |
| 20 call_00_zycMw4EjXt1oj1AeTFOW5743 | write | Author the declared target. | contract-related | completed; exit=unknown; public-output-fingerprint | 7 | specs/token/normalize/normalize.spec.md |
| 21 call_00_8jSCptnb4gp74dqvIRYD2867 | bash | Lexically observed operations: validation; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 7 | cd . &amp;&amp; npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring |
| 22 call_00_xadIqHukpqbuJqYs3ReE2278 | bash | Lexically observed operations: text-search; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | cd . &amp;&amp; grep -n "NORM-" specs/token/normalize/normalize.spec.md |
| 23 call_00_ET_9Xy9jWgHTgdZ6K9tP4lx2345 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 8 | specs/token/normalize/normalize.spec.md |
| 24 call_00_PbYBAi5vZ3Z6TaSOVwlI6047 | write | Author the declared target. | contract-related | completed; exit=unknown; public-output-fingerprint | 8 | specs/token/normalize/normalize.spec.md |
| 25 call_00_bzzNQlt4M4vhbZd8E7B06345 | bash | Lexically observed operations: shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 1 | cd . &amp;&amp; sed -n '170,188p' specs/token/normalize/normalize.spec.md |
| 26 call_00_q5AbSMtbOHcDNFjb5bDh4350 | bash | Lexically observed operations: validation; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 6 | cd . &amp;&amp; npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring |
| 27 call_00_uT3PoKvDYpoNi0msfbsa5670 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 2 | unknown |
| 28 call_00_Lu3ca9Z8D7yEDU7hPsjF9318 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 3 | specs/token/normalize/normalize.spec.md |

Read-pair candidates: 0+1 (different messages); 5+6 (already one message); 6+7 (different messages); 7+8 (already one message); 8+9 (already one message); 9+10 (already one message).

## module-nested repetition 2

Scenario: authoring-format2-oct23-module-nested-pseudocode-r2. Capture complete=true; omitted=0.

| Order and call ID | Tool | Information sought or operation | Assessment | Retained result | ms | Path or safe command |
|---|---|---|---|---|---:|---|
| 0 call_00_SEICGJccPuftd6eEx2VD8524 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 2 | inputs/brief.md |
| 1 call_01_AXHqxEY2HE6cvkx0xh3n1541 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 4 | ai/directives/sdd-v2/module.directive.xml |
| 2 call_00_BkzVyRkhdr2Q94P7uscQ9525 | bash | Create the requested canonical skeleton and obtain its manifest. | contract-related | completed; exit=0; public-output-fingerprint | 6 | npx --no-install gennady sdd-new module --scope token --module pipeline/normalize |
| 3 call_00_8zqJFsk66iZNZ67u9Mc96794 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 3 | specs/token/pipeline/normalize/normalize.spec.md |
| 4 call_00_AeX2iBi71X5HKUgWa83P5059 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 2 | unknown |
| 5 call_01_PwFvGCJaGZvIkwWT86n44220 | bash | Lexically observed operations: filesystem-discovery; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 1 | find specs -type f &#124; sort |
| 6 call_00_ET_c9wsAMLCfXplpv2WG7460347 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | specs/token/token.spec.md |
| 7 call_01_ET_wrWWgnEtkGXRg4dki5N65350 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 7 | ai/directives/sdd-v2/formats/entity-inventory-format.xml |
| 8 call_02_ET_tlSRhs4oSa5w4KYh93v92170 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/entity-surface-format.xml |
| 9 call_03_ET_9H1SPkCz70T8AWZTUGz83411 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 2 | ai/directives/sdd-v2/formats/dbc-contracts.xml |
| 10 call_00_czfgNcRjSESSloDHc1QZ7459 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 5 | ai/directives/sdd-v2/formats/module-spec-structure.xml |
| 11 call_01_WyniK8ZdVAFqvqiyesUK3265 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 7 | ai/directives/sdd-v2/formats/requirement-entry-format.xml |
| 12 call_02_PQt1U6nRFJY6bs6Xihc69673 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/diagram-vocabulary.xml |
| 13 call_00_fAIgCEYJSa0FEH7cpcOo9644 | bash | Lexically observed operations: text-search, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 3 | grep -rn "acronym\&#124;ACR" ai/directives/sdd-v2 --include=*.xml &#124; head -60 |
| 14 call_01_0EI5A8yzrk9NCGztu9Wr9714 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | specs/README.md |
| 15 call_02_0xEAs63ZyRTBGTAhA0vr5842 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | specs/infra-base/infra-base.spec.md |
| 16 call_00_SYlLdtK649zAfBG6xPXn3486 | bash | Lexically observed operations: text-search, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 12 | grep -rn "acronym\&#124;own acronym\&#124;ACR" ai/directives/sdd-v2 &#124; head -80 |
| 17 call_01_pHM7Dr4Jy79sDbvrbFKc3990 | bash | Unknown: retained action does not establish the information sought. | failed-attempt | completed; exit=1; public-output-fingerprint | 2 | unknown |
| 18 call_00_EkHecKwNqohoQlzJDryq3072 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 2 | unknown |
| 19 call_01_cuDiJeSruri8WYdiNhm43609 | bash | Lexically observed operations: filesystem-discovery; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 1 | ls -la; find . -maxdepth 2 -name package.json -not -path './node_modules/*' |
| 20 call_00_wlN2dczoIS7IcG9nlS0A7820 | bash | Lexically observed operations: shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | cat package.json |
| 21 call_01_P11Y072MsVe1RdeCmIvp5739 | bash | Lexically observed operations: shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | cat ai/directives/coding/README.md ai/directives/testing/README.md |
| 22 call_00_yZkQpan4NgGS8ugZFaef1167 | write | Author the declared target. | contract-related | completed; exit=unknown; public-output-fingerprint | 16 | specs/token/pipeline/normalize/normalize.spec.md |
| 23 call_00_MHLGku1h8hGQjg6srTxb5609 | bash | Check the artifact; freshness and necessity of retries need preceding mutation/result facts. | review-validation | completed; exit=0; public-output-fingerprint | 7 | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring |
| 24 call_00_W7FaV2I032KAFUpLFWQE1473 | bash | Lexically observed operations: text-search; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | grep -n "NORM" specs/token/pipeline/normalize/normalize.spec.md |
| 25 call_00_Bcpx7BTRicXdA2UWqdxY7585 | write | Author the declared target. | contract-related | completed; exit=unknown; public-output-fingerprint | 3 | specs/token/pipeline/normalize/normalize.spec.md |
| 26 call_00_Ovb9MJV1EygXt7u7SgFe7948 | bash | Check the artifact; freshness and necessity of retries need preceding mutation/result facts. | review-validation | completed; exit=0; public-output-fingerprint | 7 | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring |
| 27 call_00_5peCrECobwpPEpgfS3LG5058 | bash | Lexically observed operations: git-observation; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | git status --porcelain |

Read-pair candidates: 0+1 (already one message); 6+7 (already one message); 7+8 (already one message); 8+9 (already one message); 9+10 (different messages); 10+11 (already one message); 11+12 (already one message); 14+15 (already one message).

## module-flat repetition 3

Scenario: authoring-format2-oct23-module-flat-pseudocode-r3. Capture complete=true; omitted=0.

| Order and call ID | Tool | Information sought or operation | Assessment | Retained result | ms | Path or safe command |
|---|---|---|---|---|---:|---|
| 0 call_00_4l4dLwZKDZy74zDKhVC76491 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 3 | inputs/brief.md |
| 1 call_01_jcZZKrKCM35XX4Dj1mXD6817 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 7 | ai/directives/sdd-v2/module.directive.xml |
| 2 call_00_8e1GVWQWwPDjXMLLVWOm0617 | bash | Create the requested canonical skeleton and obtain its manifest. | contract-related | completed; exit=0; public-output-fingerprint | 7 | npx --no-install gennady sdd-new module --scope token --module normalize |
| 3 call_00_L85rQBQoJqled683frvc8430 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 3 | specs/token/normalize/normalize.spec.md |
| 4 call_00_yiOLH0wrpf2v2omVtdII2760 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 1 | unknown |
| 5 call_01_wgPdizzepMxXYWzz2oAc1769 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 2 | ai/directives/sdd-v2/formats/entity-inventory-format.xml |
| 6 call_02_QXWSV6cwGG7PVO9Ur3RO6158 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/entity-surface-format.xml |
| 7 call_03_uMyxYvmvCXYTBv5N1EU74922 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 2 | ai/directives/sdd-v2/formats/dbc-contracts.xml |
| 8 call_04_z6pvjkDbqq1awL1HdfaE9077 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/diagram-vocabulary.xml |
| 9 call_00_34jcUfON9wmVsceEVMTf2954 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | specs/token/token.spec.md |
| 10 call_01_hkok86gJsfCuKwKYPg2c3744 | bash | Unknown: retained action does not establish the information sought. | failed-attempt | completed; exit=1; public-output-fingerprint | 1 | unknown |
| 11 call_00_kp3sBdJ778X9vNOvVtac9928 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 6 | ai/directives/sdd-v2/formats/module-spec-structure.xml |
| 12 call_01_5Zf4VVjbaL79KCxazOqo8373 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/requirement-entry-format.xml |
| 13 call_01_s3S00E5XlawG7WhnoIRk9067 | bash | Lexically observed operations: text-search, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 3 | rg -n "DECISION_LOG_ENTRY_FORMAT&#124;ACR" ai/directives/sdd-v2/formats/module-spec-structure.xml ai/directives/sdd-v2/*.xml &#124; head -40 |
| 14 call_00_JKczvuUDmV74WyqcHuNr3552 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 1 | unknown |
| 15 call_00_hJ6YltZ4ZKYBnc1oFydP1980 | bash | Lexically observed operations: text-search, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | cat package.json; rg -n "DECISION_LOG_ENTRY_FORMAT" ai/directives/sdd-v2/interface.directive.xml -A45 &#124; head -70 |
| 16 call_00_Qhn6iqMkhnf0goFnRvrW8016 | write | Author the declared target. | contract-related | completed; exit=unknown; public-output-fingerprint | 10 | specs/token/normalize/normalize.spec.md |
| 17 call_00_f8Yky7mtbl59WdbCNPMw1559 | bash | Check the artifact; freshness and necessity of retries need preceding mutation/result facts. | review-validation | completed; exit=0; public-output-fingerprint | 7 | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring |
| 18 call_00_MvIZhJTLTTyRhWDEp0aJ6385 | write | Author the declared target. | contract-related | completed; exit=unknown; public-output-fingerprint | 9 | specs/token/normalize/normalize.spec.md |
| 19 call_00_Ftz6QPFvNvuGfrqdJUQ52451 | bash | Check the artifact; freshness and necessity of retries need preceding mutation/result facts. | review-validation | completed; exit=0; public-output-fingerprint | 7 | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring |
| 20 call_00_FaF7gTG1doPZhcIEZ9Er4349 | bash | Lexically observed operations: git-observation; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 11 | git status --short &amp;&amp; git diff --stat |

Read-pair candidates: 0+1 (already one message); 5+6 (already one message); 6+7 (already one message); 7+8 (already one message); 8+9 (different messages); 11+12 (already one message).

## module-nested repetition 3

Scenario: authoring-format2-oct23-module-nested-pseudocode-r3. Capture complete=true; omitted=0.

| Order and call ID | Tool | Information sought or operation | Assessment | Retained result | ms | Path or safe command |
|---|---|---|---|---|---:|---|
| 0 call_00_ET_J0jL0OYeYrqQFijVFChl2135 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 9 | inputs/brief.md |
| 1 call_01_ET_1cWZMXAn5jYmwEHQRXnR2625 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 2 | ai/directives/sdd-v2/module.directive.xml |
| 2 call_00_06PK4qPgRhR4QOx44JnP5957 | bash | Create the requested canonical skeleton and obtain its manifest. | contract-related | completed; exit=0; public-output-fingerprint | 5 | npx --no-install gennady sdd-new module --scope token --module pipeline/normalize |
| 3 call_00_ET_IhtipUQAgp0zFNtniGa56155 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 5 | specs/token/pipeline/normalize/normalize.spec.md |
| 4 call_00_WT03SkNr9OWKvaQ6cJTN6230 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 1 | unknown |
| 5 call_01_WXfopzEhys1sEOGfQwGB9822 | bash | Lexically observed operations: filesystem-discovery; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | ls ai/directives/sdd-v2/formats/ |
| 6 call_00_ET_ej8fHN4JbxiBbuP7rIkr5324 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 8 | specs/token/token.spec.md |
| 7 call_01_ET_RelSTVUUlTWrwVbile3I8367 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 4 | ai/directives/sdd-v2/formats/entity-inventory-format.xml |
| 8 call_02_ET_7PiD6hD5OmWWofi79WQi6038 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 8 | ai/directives/sdd-v2/formats/entity-surface-format.xml |
| 9 call_03_ET_IZYfnruIm54GLJs8hTpQ7591 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/dbc-contracts.xml |
| 10 call_04_ET_3lqQh8mkZqwTl9bwqpRA6165 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/diagram-vocabulary.xml |
| 11 call_00_6QEmd0jHRwi0Mi6UcVxO7140 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 3 | unknown |
| 12 call_01_2ZedmxN9YdWAcTNp2jUR5506 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 1 | unknown |
| 13 call_00_SDaLbXyGqp72DovvtMZq3571 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/requirement-entry-format.xml |
| 14 call_01_8Gk5dbbvEjAQuwrpijxh3199 | bash | Lexically observed operations: text-search, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | rg -n "DECISION_LOG_ENTRY_FORMAT" ai/directives/sdd-v2/formats ai/directives/sdd-v2 &#124; head |
| 15 call_00_0yPMlvKCrkORRnEcXjJW6879 | bash | Lexically observed operations: text-search; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 3 | rg -n 'id="DECISION_LOG_ENTRY_FORMAT"' ai/directives/sdd-v2 -g '*.xml' |
| 16 call_00_ET_ENazEDtiQGrhe106Olle9937 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/root.directive.xml |
| 17 call_00_7GQ3mzkd2Gg1hdV6HIoB1000 | bash | Lexically observed operations: text-search, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 1 | rg -n --glob '*.md' --glob '!node_modules' --glob '!ai/directives/**' -- "-REQ-&#124;-DL-" . &#124; head -60 |
| 18 call_00_8V7lhrtlCWyJDiT5KpIW1196 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 2 | unknown |
| 19 call_01_IZxYRCbR206s8GYjGcb49105 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 87 | unknown |
| 20 call_00_NUtBqNpduHp8l7nzIn0O0969 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | package.json |
| 21 call_01_jRUgniK4yuin3zfcLvOB9951 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 4 | specs/infra-base/infra-base.spec.md |
| 22 call_00_AW2u5UZ1dwYE1jW4rfaK7968 | write | Author the declared target. | contract-related | completed; exit=unknown; public-output-fingerprint | 8 | specs/token/pipeline/normalize/normalize.spec.md |
| 23 call_00_4WnZPuyqwanmrxZx4KQy9611 | bash | Check the artifact; freshness and necessity of retries need preceding mutation/result facts. | review-validation | completed; exit=0; public-output-fingerprint | 7 | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring |
| 24 call_00_xGNiK2QWUicVwmiwSo7M6018 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 3 | specs/token/pipeline/normalize/normalize.spec.md |
| 25 call_00_TQHHxKgjwtN6srfhqHZt7486 | write | Author the declared target. | contract-related | completed; exit=unknown; public-output-fingerprint | 4 | specs/token/pipeline/normalize/normalize.spec.md |
| 26 call_00_ET_yxqlzmBZZWrgnyOlSIgs1316 | bash | Check the artifact; freshness and necessity of retries need preceding mutation/result facts. | review-validation | completed; exit=0; public-output-fingerprint | 7 | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring |
| 27 call_00_BShLcDlOHCUpCT5rfWDz2936 | bash | Lexically observed operations: git-observation; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 11 | git status --porcelain &amp;&amp; git diff --stat |

Read-pair candidates: 0+1 (already one message); 6+7 (already one message); 7+8 (already one message); 8+9 (already one message); 9+10 (already one message); 20+21 (already one message).

## Interpretation boundaries

- Contract-related means the requested operation, not a proof of its minimality or successful information transfer.
- No tool output body or private reasoning is reconstructed. Historical output/ranges remain unknown.
- Lexical shell roles can overlap; shell payloads stay withheld. A compound exit is not per-subcommand evidence.
- Adjacent pairs overlap: do not add them into a claimed number of removable calls.
- A saved millisecond interval is tool runtime, not its counterfactual wall-time cost or provider round trip.
- Zero proven unnecessary calls means no causal removal experiment, not that all calls were necessary.

Next: annotate candidate usefulness against real results; test one removal or batching change at a time. No historical grade changes.
