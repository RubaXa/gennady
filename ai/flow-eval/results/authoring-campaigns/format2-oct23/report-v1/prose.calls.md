# Authoring call audit

Frozen source d7435fac581043d29a493e45d5539a3fb0bf20e9; input SHA-256 db8e690038df47983196d9b2ffa2d4aea9a1596f791acc0ca4541f48ee535d1a.

Runs=6; calls=166; complete-timed=166.
Result fingerprints=165; failure diagnostics=0; terminal facts only=1.
Adjacent read pairs=41; already same message=32; across messages=9. Overlapping candidates, not additive savings.

Worker wall sum ms=638612; observed assistant messages=123; union of per-run tool intervals ms=753.
Tool timestamps do not allocate remaining time to inference, queueing, network, capture or other overhead.

No necessity/causality score is inferred. Read “contract-related” as justified operation class, not proof that every read or retry was needed.
Returned content, hidden motives and shell subcommand outcomes are not reconstructed. Reflection remains separately archived self-report, not an explanation certified by this table.

## module-flat repetition 1

Scenario: authoring-format2-oct23-module-flat-prose-r1. Capture complete=true; omitted=0.

| Order and call ID | Tool | Information sought or operation | Assessment | Retained result | ms | Path or safe command |
|---|---|---|---|---|---:|---|
| 0 call_00_ET_8n782tuVR0J65X3SLkMU6641 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 5 | inputs/brief.md |
| 1 call_01_ET_cHPzctRiUKy7gpUhgVod1440 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 7 | ai/directives/sdd-v2/module.directive.xml |
| 2 call_00_fQ4AggZ2ibBRuOGdkiI17076 | bash | Create the requested canonical skeleton and obtain its manifest. | contract-related | completed; exit=0; public-output-fingerprint | 5 | npx --no-install gennady sdd-new module --scope token --module normalize |
| 3 call_00_ET_gYae1vDBds9hl3Vehis81585 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 3 | specs/token/normalize/normalize.spec.md |
| 4 call_00_eClrHXUbdZUyWWuimytL7604 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 1 | unknown |
| 5 call_00_ET_dAUQ6A2gCGiY1DumqrDX1409 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 7 | specs/token/token.spec.md |
| 6 call_01_ET_tuIgPfNIgFNOCPdhns1t8272 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/entity-inventory-format.xml |
| 7 call_02_ET_2K8nqVnHSa2h1P1Aldej8605 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 2 | ai/directives/sdd-v2/formats/entity-surface-format.xml |
| 8 call_00_SQ7KrMfzXZNd9Gv5oGFo0135 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 4 | ai/directives/sdd-v2/formats/dbc-contracts.xml |
| 9 call_01_df7Fqp9ThVYtLAvl913R9815 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/diagram-vocabulary.xml |
| 10 call_00_KJB78jMfwER56sBFiYCJ3698 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 31 | ai/directives/sdd-v2/formats/module-spec-structure.xml |
| 11 call_01_G9AYv60lNmZvjjvaVUWk2886 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 23 | ai/directives/sdd-v2/formats/requirement-entry-format.xml |
| 12 call_00_JS7U96KnSc64lCH9IIYP8092 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 3 | unknown |
| 13 call_00_HGB41WbGC5tE8X8Ulerq8417 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 2 | unknown |
| 14 call_00_ET_uZatgZ4YUT5Srp804L2K2018 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | docs/token-contract.md |
| 15 call_01_ET_XA3e1awBiIFbdBjZs4kR5148 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 2 | unknown |
| 16 call_00_qKA0ElHxRNE0esVM28ss4326 | bash | Lexically observed operations: text-search, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | grep -rn "normalize-example\&#124;empty-input-rejection\&#124;MODULE_REQUIREMENTS" --exclude-dir=node_modules --exclude-dir=.git . &#124; head -50 |
| 17 call_00_QGUttuJlJe2DZlH0f7aa4916 | bash | Lexically observed operations: text-search, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 1 | grep -rn "acronym\&#124;ACR" ai/directives/sdd-v2 --include=*.xml &#124; head -60 |
| 18 call_00_ET_qIhCBryG87SxTu7EGlla2104 | bash | Lexically observed operations: text-search, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 9 | grep -rn "acronym\&#124;ACR" ai/directives/sdd-v2 &#124; head -80 |
| 19 call_00_Vqc1FfMPMULPlavTjugC2558 | write | Author the declared target. | contract-related | completed; exit=unknown; public-output-fingerprint | 7 | specs/token/normalize/normalize.spec.md |
| 20 call_00_xgATHlSBqgfW1DIJbh7D3300 | bash | Check the artifact; freshness and necessity of retries need preceding mutation/result facts. | review-validation | completed; exit=0; public-output-fingerprint | 7 | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring |
| 21 call_00_aTtFqUaGyF7J7i0L8dq13274 | write | Author the declared target. | contract-related | completed; exit=unknown; public-output-fingerprint | 6 | specs/token/normalize/normalize.spec.md |
| 22 call_00_ET_eD9Tz6N1B7w2A16hnPH64658 | bash | Check the artifact; freshness and necessity of retries need preceding mutation/result facts. | review-validation | completed; exit=0; public-output-fingerprint | 8 | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring |
| 23 call_00_M9NHhdp730BANp76uZQU7470 | write | Author the declared target. | contract-related | completed; exit=unknown; public-output-fingerprint | 7 | specs/token/normalize/normalize.spec.md |
| 24 call_00_4yiwEKgbqbuvyrhwx8MI0947 | bash | Lexically observed operations: git-observation, validation; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 3 | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring &amp;&amp; git status --porcelain |

Read-pair candidates: 0+1 (already one message); 5+6 (already one message); 6+7 (already one message); 7+8 (different messages); 8+9 (already one message); 9+10 (different messages).

## module-nested repetition 1

Scenario: authoring-format2-oct23-module-nested-prose-r1. Capture complete=true; omitted=0.

| Order and call ID | Tool | Information sought or operation | Assessment | Retained result | ms | Path or safe command |
|---|---|---|---|---|---:|---|
| 0 call_00_bkZe3i3vJn7FaruAPiq13065 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 3 | inputs/brief.md |
| 1 call_01_LkJLzQ3pxLBqDqItMnrP1442 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/module.directive.xml |
| 2 call_00_G0M2u1yQbTMQeYHVj5XJ5603 | bash | Create the requested canonical skeleton and obtain its manifest. | contract-related | completed; exit=0; public-output-fingerprint | 5 | npx --no-install gennady sdd-new module --scope token --module pipeline/normalize |
| 3 call_00_ET_qhrmWcEmiJhjIWYmeBP28496 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 3 | specs/token/pipeline/normalize/normalize.spec.md |
| 4 call_00_kdPJbTQ7YiXskWI4iKz68596 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 2 | unknown |
| 5 call_00_ET_2XMyUI1kH5BCmqGEPaqi6284 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | specs/token/token.spec.md |
| 6 call_01_ET_jtp3kYtkQzORXxScUrZV4933 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 7 | ai/directives/sdd-v2/formats/entity-inventory-format.xml |
| 7 call_02_ET_mPlJxYjsa8HsJl7lJktD5327 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 2 | ai/directives/sdd-v2/formats/entity-surface-format.xml |
| 8 call_03_ET_Qfz2fKyTFm67V5purq702207 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/dbc-contracts.xml |
| 9 call_00_f2Puf40KOB2z8iDlU1Ru3725 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 4 | ai/directives/sdd-v2/formats/diagram-vocabulary.xml |
| 10 call_01_pm4oqdoJLVSzTEvWTbSw1219 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 7 | ai/directives/sdd-v2/formats/requirement-entry-format.xml |
| 11 call_00_vlfGX8gDJ6UnCadb11rz3504 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/module-spec-structure.xml |
| 12 call_01_BptS9Qh76OY4AcZJVVdN1137 | bash | Lexically observed operations: text-search, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | rg -n "module acronym&#124;MODULE_REQUIREMENTS&#124;ACR.*module&#124;spec acronym" ai specs README.md &#124; head -40 |
| 13 call_00_6T1EoYyLFsSgiQiBonwd5304 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 1 | unknown |
| 14 call_00_ayXqN0uJedsMCRcUFdJY7198 | write | Author the declared target. | contract-related | completed; exit=unknown; public-output-fingerprint | 11 | specs/token/pipeline/normalize/normalize.spec.md |
| 15 call_00_JiTKDRB7NLtm3VDJQVlC6866 | bash | Check the artifact; freshness and necessity of retries need preceding mutation/result facts. | review-validation | completed; exit=0; public-output-fingerprint | 8 | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring |
| 16 call_00_6Hy2Mhydxf8IwdDC0uXW0373 | write | Author the declared target. | contract-related | completed; exit=unknown; public-output-fingerprint | 4 | specs/token/pipeline/normalize/normalize.spec.md |
| 17 call_00_4Fe2GDvfenYhPZeG9LTh8663 | bash | Check the artifact; freshness and necessity of retries need preceding mutation/result facts. | review-validation | completed; exit=0; public-output-fingerprint | 7 | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring |
| 18 call_00_HXqWmiLn6DE77A9PzPnZ8660 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 13 | unknown |

Read-pair candidates: 0+1 (already one message); 5+6 (already one message); 6+7 (already one message); 7+8 (already one message); 8+9 (different messages); 9+10 (already one message); 10+11 (different messages).

## module-flat repetition 2

Scenario: authoring-format2-oct23-module-flat-prose-r2. Capture complete=true; omitted=0.

| Order and call ID | Tool | Information sought or operation | Assessment | Retained result | ms | Path or safe command |
|---|---|---|---|---|---:|---|
| 0 call_00_ET_47MnCBKs2GXkajLv5rNL8417 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 4 | inputs/brief.md |
| 1 call_01_ET_uHBwRIOPz38q9UlgCBd78602 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 4 | ai/directives/sdd-v2/module.directive.xml |
| 2 call_00_jVnqzxNwRjnnvnMg19fO7576 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 1 | unknown |
| 3 call_00_ET_9I8S1vODVURv9I2c8vTR8336 | bash | Lexically observed operations: filesystem-discovery, creation-or-metadata; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 6 | ls -la specs/token &amp;&amp; npx --no-install gennady sdd-new module --scope token --module normalize |
| 4 call_00_AWvjQX5ORknD2Gk39mSz4044 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 4 | specs/token/normalize/normalize.spec.md |
| 5 call_01_IEhQk4CMKwwav1oFsXYm9548 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | specs/token/token.spec.md |
| 6 call_00_YaFaIW0hg4hzgLSlXHCE1634 | bash | Lexically observed operations: filesystem-discovery; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 1 | ls ai/directives/sdd-v2/formats/ &amp;&amp; ls specs/infra-base |
| 7 call_01_yU6Rpu0n7t8z2zXCYJVa5620 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 4 | ai/directives/sdd-v2/formats/entity-inventory-format.xml |
| 8 call_02_8IO5RZxQjqD8LPIzZp1m4841 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/entity-surface-format.xml |
| 9 call_03_fpoeCznq1aedT2lAEusv1563 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 4 | ai/directives/sdd-v2/formats/dbc-contracts.xml |
| 10 call_04_rgjhoX8jqT14xFAKclJ40676 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 8 | ai/directives/sdd-v2/formats/diagram-vocabulary.xml |
| 11 call_00_XZRBgRZluGgDVy9EItSs4418 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/requirement-entry-format.xml |
| 12 call_01_tbh9LC7354hCFj866GpS7469 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/module-spec-structure.xml |
| 13 call_02_nMcOlL7MEkPDBCby7T0e3271 | bash | Lexically observed operations: filesystem-discovery, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | ls -R docs &#124; head -50 |
| 14 call_00_vNjOpLFmqCvR0wN7xiEQ5874 | bash | Lexically observed operations: filesystem-discovery, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 1 | find specs/infra-base -type f -maxdepth 3 -print &amp;&amp; ls ai/directives/sdd-v2 &#124; head -40 |
| 15 call_01_ipLhdguV08NeC6em2s8q2328 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 8 | docs/token-contract.md |
| 16 call_00_wfhULEzq8MrW0QRrUgKx4704 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | specs/infra-base/infra-base.spec.md |
| 17 call_00_oVIUbb142A5n1OhCwNoH1116 | bash | Lexically observed operations: text-search, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | rg -n "[A-Z][A-Z0-9-]*-REQ-" ai docs specs --glob '*.md' --glob '*.xml' &#124; head -60 |
| 18 call_00_0KzWwXLDclT1QJUY1CYv2587 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 4 | ai/directives/sdd-v2/formats/module-diagram-ladder.example.md |
| 19 call_00_IJ5Y51KT6tximYR3U4By4530 | bash | Lexically observed operations: text-search, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | rg -n "acronym&#124;акроним&#124;SPEC_ID&#124;spec id" ai/directives/sdd-v2 specs --glob '*.xml' --glob '*.md' &#124; head -80 |
| 20 call_00_bqSsUSjXjqUzGIRHxs562759 | bash | Lexically observed operations: filesystem-discovery, text-search, shell-read; exact information returned is unknown. | failed-attempt | completed; exit=1; public-output-fingerprint | 2 | cat package.json &amp;&amp; find . -maxdepth 2 -name 'tsconfig*' -o -maxdepth 2 -name '*.config.*' &#124; grep -v node_modules |
| 21 call_00_7q7Mieuep8yM7hSrWFJv9987 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 2 | unknown |
| 22 call_00_KkBllVGBH1bIpbT3K6en8560 | write | Author the declared target. | contract-related | completed; exit=unknown; public-output-fingerprint | 11 | specs/token/normalize/normalize.spec.md |
| 23 call_00_ET_XALe0dHWBB2bzEGtmwRQ4156 | bash | Check the artifact; freshness and necessity of retries need preceding mutation/result facts. | review-validation | completed; exit=0; public-output-fingerprint | 8 | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring |
| 24 call_00_HGYYRF9RxQcmg0IAlT1F7930 | bash | Lexically observed operations: shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 8 | sed -i '' 's/NORM-REQ/NOR-REQ/g; s/NORM-DL/NOR-DL/g' specs/token/normalize/normalize.spec.md |
| 25 call_00_XEp7l9CUNattiawmyUKA1399 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 3 | specs/token/normalize/normalize.spec.md |
| 26 call_00_hfH4GpU1oOrCWTfxDSGa4225 | bash | Check the artifact; freshness and necessity of retries need preceding mutation/result facts. | review-validation | completed; exit=0; public-output-fingerprint | 7 | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring |
| 27 call_00_X7F0hE3itZ2FN8TWSg1w4892 | bash | Lexically observed operations: git-observation; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 11 | git status --short &amp;&amp; git diff --stat |

Read-pair candidates: 0+1 (already one message); 4+5 (already one message); 7+8 (already one message); 8+9 (already one message); 9+10 (already one message); 10+11 (different messages); 11+12 (already one message); 15+16 (different messages).

## module-nested repetition 2

Scenario: authoring-format2-oct23-module-nested-prose-r2. Capture complete=true; omitted=0.

| Order and call ID | Tool | Information sought or operation | Assessment | Retained result | ms | Path or safe command |
|---|---|---|---|---|---:|---|
| 0 call_00_ET_8FaKcp92Y1excPiAqo1B1576 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 2 | inputs/brief.md |
| 1 call_01_ET_Dqbq1YmwsTzmYVyvGf513141 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 6 | ai/directives/sdd-v2/module.directive.xml |
| 2 call_00_lqcACwfpf95yNKwIoLNt2008 | bash | Create the requested canonical skeleton and obtain its manifest. | contract-related | completed; exit=0; public-output-fingerprint | 5 | npx --no-install gennady sdd-new module --scope token --module pipeline/normalize |
| 3 call_00_ET_kTi9xVcrQ6hQhjqSIlXQ5387 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 3 | specs/token/pipeline/normalize/normalize.spec.md |
| 4 call_00_j0uaq59krOloN1KFPETk1158 | bash | Lexically observed operations: filesystem-discovery, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | ls -R specs ai/directives/sdd-v2/formats &#124; head -100 |
| 5 call_00_ET_4ng6GIlaJehA5UR39O0W5158 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 2 | specs/token/token.spec.md |
| 6 call_01_ET_5G06poZ8uXHnfDG3U0JQ2745 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/entity-inventory-format.xml |
| 7 call_02_ET_3wUsenK9Q9h5WFZzYpQh9633 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 2 | ai/directives/sdd-v2/formats/entity-surface-format.xml |
| 8 call_03_ET_vaKSbklhZbJ4KVZ5vAQP1828 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/dbc-contracts.xml |
| 9 call_04_ET_FAeByNTiQFlAX2oas72x5170 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/diagram-vocabulary.xml |
| 10 call_00_JX7Aw6MYLsQ2iavLfAnf2262 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 8 | ai/directives/sdd-v2/formats/module-spec-structure.xml |
| 11 call_01_okEi5hFqJNqo7ohVHUlx2913 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/requirement-entry-format.xml |
| 12 call_00_tHBMQOQ3FOZfjhvom8Mc9679 | bash | Lexically observed operations: text-search, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 1 | grep -rl "DECISION_LOG_ENTRY_FORMAT" ai/directives/sdd-v2 &#124; head |
| 13 call_01_9pUixfzZ8C2LlPcSmDUb8575 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 1 | unknown |
| 14 call_00_65krU4FTg09LRZBFZgIy1218 | bash | Lexically observed operations: text-search; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | grep -n -A40 "DECISION_LOG_ENTRY_FORMAT" ai/directives/sdd-v2/compression.directive.xml |
| 15 call_00_u4kDlF97EFTS2DKWTxyk9399 | bash | Lexically observed operations: text-search, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 1 | grep -rn "SPEC_ID" -A3 specs &#124; head -40; grep -rn "### [A-Z]*-REQ" specs &#124; head -30 |
| 16 call_00_76rS7egIakxaix99napF5418 | bash | Lexically observed operations: text-search, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | grep -rn "acronym" ai/directives/sdd-v2 &#124; head -40 |
| 17 call_00_iilC6u8CmLNC5keL5VX80143 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 2 | specs/infra-base/infra-base.spec.md |
| 18 call_00_0PjnCGwGKiXVwfE9Ldda6406 | bash | Lexically observed operations: filesystem-discovery, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | ls -la; find . -maxdepth 2 -name 'package.json' -o -maxdepth 2 -name 'tsconfig.json' &#124; head |
| 19 call_00_ET_aamqO3lIQDJNKsbLoylH2655 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | package.json |
| 20 call_00_hnael8HEbX8Z0lqy7jhB8557 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 2 | unknown |
| 21 call_00_16caPK8HA7JzG0QzsdTJ3354 | write | Author the declared target. | contract-related | completed; exit=unknown; public-output-fingerprint | 11 | specs/token/pipeline/normalize/normalize.spec.md |
| 22 call_00_4YTmtGbNaEhHJdf7tgsJ7203 | bash | Check the artifact; freshness and necessity of retries need preceding mutation/result facts. | review-validation | completed; exit=0; public-output-fingerprint | 7 | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring |
| 23 call_00_iVtwGLfv3FAciuCHpbDT4656 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 2 | unknown |
| 24 call_00_G3KTSlQcIFhkJFXLkhPE3493 | bash | Check the artifact; freshness and necessity of retries need preceding mutation/result facts. | review-validation | completed; exit=0; public-output-fingerprint | 6 | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring |
| 25 call_00_Xkdzj2IE7RBXLUYdl7Y88798 | bash | Lexically observed operations: text-search, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | grep -rn "authoring-complete" ai specs docs &#124; head -30 |
| 26 call_00_IZOqnLaLE8qy65jrHrhO3396 | bash | Lexically observed operations: shell-other; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 5 | npx --no-install gennady sdd-log specs/token/pipeline/normalize/normalize.spec.md authoring-complete |
| 27 call_00_2jBQDuyqnM7dGFyxfRAm9883 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 14 | specs/token/pipeline/normalize/normalize.spec.md |
| 28 call_01_1U6CpinjaG4xvXCnnOvh9416 | bash | Lexically observed operations: git-observation; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | git status --porcelain |
| 29 call_00_O14UydjEvmpgDYwP9zfG5111 | bash | Check the artifact; freshness and necessity of retries need preceding mutation/result facts. | review-validation | completed; exit=0; public-output-fingerprint | 6 | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring |
| 30 call_00_dEDwZdgDkvN7kmoLkvQt0298 | write | Author the declared target. | contract-related | completed; exit=unknown; public-output-fingerprint | 4 | specs/token/pipeline/normalize/normalize.spec.md |
| 31 call_00_8ulkXddjfjst6iKPB4Ne0783 | bash | Check the artifact; freshness and necessity of retries need preceding mutation/result facts. | review-validation | completed; exit=0; public-output-fingerprint | 7 | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring |
| 32 call_00_zhuic00Y5RnE2x3JNOnR9830 | bash | Lexically observed operations: shell-other; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 5 | npx --no-install gennady sdd-log specs/token/pipeline/normalize/normalize.spec.md authoring-complete |
| 33 call_00_4OlVlWjQtTiMySlidj5A5150 | bash | Check the artifact; freshness and necessity of retries need preceding mutation/result facts. | review-validation | completed; exit=0; public-output-fingerprint | 7 | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring |
| 34 call_01_azXBnWgbS7vlavTC3vIA3299 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 3 | unknown |

Read-pair candidates: 0+1 (already one message); 5+6 (already one message); 6+7 (already one message); 7+8 (already one message); 8+9 (already one message); 9+10 (different messages); 10+11 (already one message).

## module-flat repetition 3

Scenario: authoring-format2-oct23-module-flat-prose-r3. Capture complete=true; omitted=0.

| Order and call ID | Tool | Information sought or operation | Assessment | Retained result | ms | Path or safe command |
|---|---|---|---|---|---:|---|
| 0 call_00_ET_40SLEj8b1ZIO03Jk11J91478 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 5 | inputs/brief.md |
| 1 call_01_ET_wwbWmvGjagbYVMSHPFkg4444 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 4 | ai/directives/sdd-v2/module.directive.xml |
| 2 call_00_9Y1H79cV6bgv2Qv4yCqn4994 | bash | Create the requested canonical skeleton and obtain its manifest. | contract-related | completed; exit=0; public-output-fingerprint | 5 | npx --no-install gennady sdd-new module --scope token --module normalize |
| 3 call_00_giKJijpFqLgwChEM9zDQ0164 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 3 | specs/token/normalize/normalize.spec.md |
| 4 call_01_UCY44bhphfpMaNbfVrKm5092 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 1 | unknown |
| 5 call_00_84QS4FGWQsRpLGOsoBqi4209 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 2 | specs/token/token.spec.md |
| 6 call_01_YivpvJ76fgAPPrmmWa1x3437 | bash | Lexically observed operations: filesystem-discovery; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 1 | ls ai/directives/sdd-v2/formats; ls ai/directives/sdd-v2 |
| 7 call_00_LnlHzgjQcssJC8tlRFr40774 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/entity-inventory-format.xml |
| 8 call_01_I8zFhrk2FcU2URusNcxf6367 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 8 | ai/directives/sdd-v2/formats/entity-surface-format.xml |
| 9 call_02_8EDkOT2fo2ylQGdU9XZV2560 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/dbc-contracts.xml |
| 10 call_03_Ueq0x2cTqiXQg4msqGwy9404 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 4 | ai/directives/sdd-v2/formats/diagram-vocabulary.xml |
| 11 call_00_75D5M2qbyC6yPRyonCaw1974 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 2 | unknown |
| 12 call_01_bUM6AcaM663RPwkWlgUk1932 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/module-spec-structure.xml |
| 13 call_00_kWSCD9cAVrf0S59aY4o38625 | bash | Lexically observed operations: text-search, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | rg -n "DECISION_LOG_ENTRY_FORMAT" ai &#124; head -20 |
| 14 call_01_X5kT9Q3pgyTwOPzCfd180614 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 7 | ai/directives/sdd-v2/formats/requirement-entry-format.xml |
| 15 call_00_c3pZyPqC8SU1KLn0hg5A8140 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/root.directive.xml |
| 16 call_01_bNokOcya4Mq4YCZdMVsB4022 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 1 | unknown |
| 17 call_00_FGBDFwR5Ap4OOMwhJQgn6274 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 2 | unknown |
| 18 call_00_UZOUfCD3z2AJElHlfZ1f9200 | bash | Lexically observed operations: text-search, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | rg -n --glob '!node_modules/**' --glob '*.spec.md' -- "REQ-" specs docs &#124; head -40; rg -n "SPEC_ID&#124;acronym" docs ai/directives/sdd-v2 &#124; head -40 |
| 19 call_00_Ufcnq1WmdkgxhyUoPYra7912 | write | Author the declared target. | contract-related | completed; exit=unknown; public-output-fingerprint | 8 | specs/token/normalize/normalize.spec.md |
| 20 call_00_KvnQKWtmdJfx3SUUDKid8585 | bash | Check the artifact; freshness and necessity of retries need preceding mutation/result facts. | review-validation | completed; exit=0; public-output-fingerprint | 7 | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring |
| 21 call_00_mKk7oMAJykkIqgcfdi947473 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 3 | specs/token/normalize/normalize.spec.md |
| 22 call_00_oj3m0bXFLrJok1X59jsM7989 | write | Author the declared target. | contract-related | completed; exit=unknown; public-output-fingerprint | 5 | specs/token/normalize/normalize.spec.md |
| 23 call_00_A2YXuZb9afmsMgQfJHxp2655 | bash | Check the artifact; freshness and necessity of retries need preceding mutation/result facts. | review-validation | completed; exit=0; public-output-fingerprint | 7 | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring |
| 24 call_00_12G2w9mwvd8AAdDa3nke8518 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 3 | specs/token/normalize/normalize.spec.md |
| 25 call_00_luN77cdbxT2cT0aqXBbp8259 | write | Author the declared target. | contract-related | completed; exit=unknown; public-output-fingerprint | 4 | specs/token/normalize/normalize.spec.md |
| 26 call_00_ChnJPf4LjIbyo8Oz5d5Y0462 | bash | Check the artifact; freshness and necessity of retries need preceding mutation/result facts. | review-validation | completed; exit=0; public-output-fingerprint | 7 | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring |
| 27 call_00_g8mRofU9cAwVUmrVMciK9688 | bash | Unknown: retained action does not establish the information sought. | unknown | completed; exit=0; public-output-fingerprint | 7 | unknown |
| 28 call_00_lnD90ns48taPUxFYRMsI5285 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 3 | specs/token/normalize/normalize.spec.md |

Read-pair candidates: 0+1 (already one message); 7+8 (already one message); 8+9 (already one message); 9+10 (already one message); 14+15 (different messages).

## module-nested repetition 3

Scenario: authoring-format2-oct23-module-nested-prose-r3. Capture complete=true; omitted=0.

| Order and call ID | Tool | Information sought or operation | Assessment | Retained result | ms | Path or safe command |
|---|---|---|---|---|---:|---|
| 0 call_00_ET_NLjjPtrSGdEiZCvJBnB21307 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 3 | inputs/brief.md |
| 1 call_01_ET_3c2w47ZcPhwJyDfp64MS0780 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/module.directive.xml |
| 2 call_00_DQrXVA6iONqnSK6W1wds9687 | bash | Create the requested canonical skeleton and obtain its manifest. | contract-related | completed; exit=0; public-output-fingerprint | 6 | npx --no-install gennady sdd-new module --scope token --module pipeline/normalize |
| 3 call_00_uIJYwks5zx7YE9Y25Svr8955 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 3 | specs/token/pipeline/normalize/normalize.spec.md |
| 4 call_01_BIc7WtpZH8UOSep0Lmh35048 | bash | Lexically observed operations: filesystem-discovery; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 1 | find specs -maxdepth 4 -type f &#124; sort |
| 5 call_00_ao9iWoPxkXqJ2tfl22oV5253 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 2 | specs/token/token.spec.md |
| 6 call_01_JaCv7NfBJUiu9n02b75O9013 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/entity-inventory-format.xml |
| 7 call_02_te7FSyEHTCD2hazqwYap3105 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/entity-surface-format.xml |
| 8 call_03_d53akygqAUB5InV18BTt1213 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | ai/directives/sdd-v2/formats/dbc-contracts.xml |
| 9 call_00_nYNyCklGAR1vsDp8oMdp1446 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 4 | ai/directives/sdd-v2/formats/diagram-vocabulary.xml |
| 10 call_01_cSVOo3M2xSc7femzNDiy5100 | read | Read reference/instruction context; relevance is observable, necessity needs review. | failed-attempt | error; exit=unknown; terminal-facts-only | 1 | ai/directives/sdd-v2/formats/decision-log-formats.xml |
| 11 call_02_Rq7dLq2ou6N5U57yuIVG0093 | bash | Lexically observed operations: filesystem-discovery; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 1 | ls ai/directives/sdd-v2/formats |
| 12 call_00_aZGOUNNVgbSIu4aTZhNE9295 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 4 | ai/directives/sdd-v2/formats/module-spec-structure.xml |
| 13 call_01_HG22js7XIbBBunmluA8l3199 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 5 | ai/directives/sdd-v2/formats/requirement-entry-format.xml |
| 14 call_00_cJfRgIefaSpSMfnQtL4R8617 | bash | Lexically observed operations: text-search, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | grep -rn "DECISION_LOG_ENTRY_FORMAT" ai specs --include=*.xml --include=*.md &#124; head -20 |
| 15 call_00_F6oXmogP0fHwTpNIHvnC4514 | grep | Find paths or matching text; pattern/results may not be retained. | review-discovery | completed; exit=unknown; public-output-fingerprint | 21 | unknown |
| 16 call_00_9VJ3I56PWL6pSIGbW5Tu1437 | bash | Lexically observed operations: shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 1 | sed -n '500,530p' ai/directives/sdd-v2/root.directive.xml |
| 17 call_00_jaRMYTWToyFxp4fjRL9H8186 | bash | Lexically observed operations: filesystem-discovery, shell-read; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | ls -la; find . -maxdepth 2 -type f -not -path './.git/*' &#124; sort &#124; head -50 |
| 18 call_00_NjkQ6wqfIBskQk4wVgCy3291 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 3 | package.json |
| 19 call_01_fxJBFPhPHDeVX0ZwO5Qs4079 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 4 | docs/token-contract.md |
| 20 call_02_LShio06QvxO2aryZFo1f7774 | read | Read reference/instruction context; relevance is observable, necessity needs review. | review-context | completed; exit=unknown; public-output-fingerprint | 2 | specs/README.md |
| 21 call_00_WgOQiH4Jbm7BdZ5Lv74T6404 | bash | Lexically observed operations: filesystem-discovery; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | find ai/directives -maxdepth 2 -type f &#124; sort |
| 22 call_00_Kd8bwdn8Gz92xJZqGxDh1782 | bash | Lexically observed operations: git-observation; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | git status --porcelain=v1 |
| 23 call_00_mgudGxkjYZZ7IdkslQbm0094 | write | Author the declared target. | contract-related | completed; exit=unknown; public-output-fingerprint | 13 | specs/token/pipeline/normalize/normalize.spec.md |
| 24 call_00_wbrzHyaR6VTWLPgNxHT04724 | bash | Check the artifact; freshness and necessity of retries need preceding mutation/result facts. | review-validation | completed; exit=0; public-output-fingerprint | 7 | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring |
| 25 call_00_w0X1DgJFkunb2eU9T6Bg5458 | read | Load task-declared context or current target; contract-related, not proof every range was needed. | contract-related | completed; exit=unknown; public-output-fingerprint | 8 | specs/token/pipeline/normalize/normalize.spec.md |
| 26 call_00_1S5pd6QXstKGRhhYfcZg2853 | bash | Lexically observed operations: shell-read, git-observation; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 23 | git diff -- specs/token/pipeline/normalize/normalize.spec.md &#124; head -5 |
| 27 call_00_YqBYxpdC1p8jxVXgUV8d2997 | write | Author the declared target. | contract-related | completed; exit=unknown; public-output-fingerprint | 5 | specs/token/pipeline/normalize/normalize.spec.md |
| 28 call_00_XYPWdAt9fNQjVR5tSfjM3367 | bash | Check the artifact; freshness and necessity of retries need preceding mutation/result facts. | review-validation | completed; exit=0; public-output-fingerprint | 6 | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring |
| 29 call_00_keQESKDw643UOoxdQpIT2747 | bash | Lexically observed operations: git-observation; exact information returned is unknown. | review-shell | completed; exit=0; public-output-fingerprint | 2 | git status --porcelain=v1 |

Read-pair candidates: 0+1 (already one message); 5+6 (already one message); 6+7 (already one message); 7+8 (already one message); 8+9 (different messages); 12+13 (already one message); 18+19 (already one message); 19+20 (already one message).

## Interpretation boundaries

- Contract-related means the requested operation, not a proof of its minimality or successful information transfer.
- No tool output body or private reasoning is reconstructed. Historical output/ranges remain unknown.
- Lexical shell roles can overlap; shell payloads stay withheld. A compound exit is not per-subcommand evidence.
- Adjacent pairs overlap: do not add them into a claimed number of removable calls.
- A saved millisecond interval is tool runtime, not its counterfactual wall-time cost or provider round trip.
- Zero proven unnecessary calls means no causal removal experiment, not that all calls were necessary.

Next: annotate candidate usefulness against real results; test one removal or batching change at a time. No historical grade changes.
