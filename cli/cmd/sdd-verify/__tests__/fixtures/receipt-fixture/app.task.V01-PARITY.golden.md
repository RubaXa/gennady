<!--SECTION:META-->
- **Task-ID:** V01-PARITY
<!--/SECTION:META-->
<!--SECTION:PHASES_OVERVIEW-->
| ID | Kind | Deps | Status |
|---|---|---|---|
| P1 | impl | — | [ ] |
<!--/SECTION:PHASES_OVERVIEW-->
<!--SECTION:PHASE_P1-->
- **Rules:**
  - none
- **Target Files:**
  - src/a.ts
- **Deleted Files:**
  - none
<!--/SECTION:PHASE_P1-->
<!--SECTION:VERIFICATION-->
- **Coverage Policy:** not-applicable
- **Coverage Reason:** fixture
| Command | Required by | Role |
|---|---|---|
| — | — | extra |
<!--/SECTION:VERIFICATION-->
<!--SECTION:EXECUTION_LOG-->
## Execution Log
<!--SDD_PHASE_RECEIPT:P1-->
```json
{
  "schema": 1,
  "ticket": "specs/app/app.task.V01-PARITY.md",
  "phase": "P1",
  "profile": "code",
  "profileBasis": "phase-kind",
  "targets": [
    "src/a.ts"
  ],
  "deletedFiles": [],
  "verification": [],
  "producesCoverage": false,
  "environmentState": "sha256:d7b6b972bb2ec69233fb99906003f74e5c2cfc24347d019dc6807565475c09a3",
  "planState": "sha256:a1ae95c5264ccd965636d82e5a00b71f3bf52ee50f4bc4acb10fd53aa29929a1",
  "targetState": "sha256:7deef10f1bed209b43d97e5b12fe5cc8066e0e61b402434477ff39ebad05dc1e",
  "targetEvidence": {
    "src/a.ts": "sha256:7deef10f1bed209b43d97e5b12fe5cc8066e0e61b402434477ff39ebad05dc1e"
  },
  "commands": [
    {
      "gate": "fix",
      "role": "repair",
      "command": "npm run format:fix -- src/a.ts && npm run lint:fix -- src/a.ts && npx --no-install gennady lint --autofix --include-tests --spec=specs/app/app.spec.md -- src/a.ts",
      "exitCode": 0
    },
    {
      "gate": "type-check",
      "role": "foundation",
      "command": "npm run type-check",
      "exitCode": 0
    },
    {
      "gate": "test",
      "role": "foundation",
      "command": "npm run test",
      "exitCode": 0
    }
  ],
  "gateEvidence": [
    {
      "name": "fix",
      "state": "PROVEN",
      "command": "target-repair",
      "provider": null
    },
    {
      "name": "type-check",
      "state": "PROVEN",
      "command": "npm run type-check",
      "provider": null
    },
    {
      "name": "test",
      "state": "PROVEN",
      "command": "npm run test",
      "provider": null
    }
  ]
}
```
<!--/SDD_PHASE_RECEIPT:P1-->
<!--/SECTION:EXECUTION_LOG-->