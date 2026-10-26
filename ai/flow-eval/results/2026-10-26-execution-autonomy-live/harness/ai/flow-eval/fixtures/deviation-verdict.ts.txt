// @file: Bounded operator-verdict fixture with exact-byte mechanical assertions for three log owners.
// @spec: AI-SKILLS
// @consumers: provision, deviation-verdict smoke scenario

const MODULE =
  '<!--SECTION:MODULE_VISION-->\ncore owns retry policy.\n<!--/SECTION:MODULE_VISION-->\n<!--SECTION:MODULE_DECISION_LOG-->\nCOR-DL-1 retry limit (why: bounded) [verdict: pending-operator]\nCOR-DL-10 unrelated [verdict: pending-operator]\n<!--/SECTION:MODULE_DECISION_LOG-->\n';
const INDEX =
  '# core — Tasks\n\n## Tracker Index\n| Task-ID | Title | Dependencies | Status | Reopens |\n|---|---|---|---|---|\n\n## Decision Log (module-task level)\nCOR-DL-2 planning limit (why: bounded) [verdict: pending-operator]\n\n## Conventions\nNever alter this section.\n';
const TICKET =
  '<!--SECTION:META-->\n- **Task-ID:** COR-review\n- **Status:** [ ] TODO\n<!--/SECTION:META-->\n<!--SECTION:EXECUTION_LOG-->\n## Execution Log\n<!--/SECTION:EXECUTION_LOG-->\n<!--SECTION:DECISION_LOG-->\nCOR-DL-3 local retry (why: bounded) [verdict: pending-operator]\n<!--/SECTION:DECISION_LOG-->\n';

/** @purpose Exact prepared artifacts; the golden comparison permits only three operator-selected tokens. */
export const DEVIATION_VERDICT_FILES: Record<string, string> = {
  'inputs/brief.md':
    '# Operator verdicts\nUse the installed `gennady sdd-log <path> deviation-verdict <ID> <verdict>` command to record exactly these already-confirmed operator decisions:\n- specs/demo/core/core.spec.md: COR-DL-1 → accepted\n- specs/demo/core/core.3-tasks.md: COR-DL-2 → rework\n- specs/demo/core/core.task.COR-review.md: COR-DL-3 → rolled-back\nDo not ask for approval again. Do not manually edit or rewrite artifacts, create tickets, run execute, or resolve COR-DL-10. Do not edit golden/. Run `bash golden/verify.sh` and report the result. This task measures an existing Decision Log transition, not full specification authoring.\n',
  'specs/demo/core/core.spec.md': MODULE,
  'specs/demo/core/core.3-tasks.md': INDEX,
  'specs/demo/core/core.task.COR-review.md': TICKET,
  'golden/expected.json':
    JSON.stringify(
      {
        'specs/demo/core/core.spec.md': MODULE.replace(
          'COR-DL-1 retry limit (why: bounded) [verdict: pending-operator]',
          'COR-DL-1 retry limit (why: bounded) [verdict: accepted]'
        ),
        'specs/demo/core/core.3-tasks.md': INDEX.replace(
          '[verdict: pending-operator]',
          '[verdict: rework]'
        ),
        'specs/demo/core/core.task.COR-review.md': TICKET.replace(
          '[verdict: pending-operator]',
          '[verdict: rolled-back]'
        ),
      },
      null,
      2
    ) + '\n',
  'golden/verify.sh':
    '#!/usr/bin/env bash\nset -euo pipefail\ncd "$(dirname "$0")/.."\nnode --input-type=module -e \'import assert from "node:assert/strict"; import {readFileSync} from "node:fs"; const expected=JSON.parse(readFileSync("golden/expected.json","utf8")); for(const [path,bytes] of Object.entries(expected)) assert.equal(readFileSync(path,"utf8"),bytes,path); console.log("PASS: three exact verdict transitions; all other bytes preserved");\'\n',
};
