# Execution autonomy: исходные детерминированные наблюдения

Source: `7958ecb0a3cabcfd2ba923d272a65e00a981a0c6`, Node `v22.19.0`, 2026-10-26.
Новые live evals: **0**. Это диагностики существующего кода и исходная точка
[плана](../../docs/EXECUTION-AUTONOMY-PLAN.md), не сравнительный замер поведения модели.
JSON-выводы ниже отформатированы для чтения; значения сохранены, это не byte-exact raw logs.

Все команды ниже выполнены из корня checkout через `node --import tsx --input-type=module`
с программой из stdin, exit 0. Проверенные production sources побайтово совпали с Git HEAD.
Изменения на момент измерения — только draft specs/plan/README. Sandbox, session, server,
coverage и копии зависимостей этими диагностическими командами не создаются.

## 1. Completion принимает потерянный deviation

Фактический stdout (Node 22):

```json
{
  "case": "handoff-orphan",
  "completeAccepted": true,
  "records": 0,
  "verdict": { "ok": false, "detail": "deviation DEM-DL-1 not found in ticket Decision Log" },
  "controlRecords": 1,
  "controlVerdictAccepted": true
}
```

Воспроизведение из корня checkout на указанном source:

```js
import assert from 'node:assert/strict';
import { completePhase, isCompleteHandoffPayload } from './cli/cmd/sdd-log/sdd-log.types.ts';
import { parseDeviationRecords, setDeviationVerdict } from './shared/sdd/deviation.ts';
const ticket = [
  '<!--SECTION:PHASES_OVERVIEW-->',
  '| ID | Kind | Deps | Status |',
  '| --- | --- | --- | --- |',
  '| P1 | code | — | [ ] |',
  '<!--/SECTION:PHASES_OVERVIEW-->',
  '<!--SECTION:EXECUTION_LOG-->',
  '### Round 1 — 2026-10-26, initial',
  '#### P1',
  '- [ ] `<ts>` DONE',
  '**Handoff →** artifacts: [...]; decisions: [...]; open: [...]; deviations: [...]',
  '<!--/SECTION:EXECUTION_LOG-->',
  '<!--SECTION:DECISION_LOG-->',
  '<!--/SECTION:DECISION_LOG-->',
].join('\n');
const payload =
  'artifacts: [src/retry.ts]; decisions: [retry=3]; open: []; deviations: [DEM-DL-1: chose retry cap 3]';
assert.equal(isCompleteHandoffPayload(payload), true);
const completed = completePhase(ticket, 'P1', payload, '2026-10-26T00:00:00.000Z', true);
assert.equal(completed.ok, true);
const content = completed.content;
const control = content.replace(
  '<!--SECTION:DECISION_LOG-->',
  '<!--SECTION:DECISION_LOG-->\nDEM-DL-1 retry=3 [verdict: pending-operator]'
);
assert.equal(parseDeviationRecords(content).length, 0);
assert.equal(setDeviationVerdict(content, 'DEM-DL-1', 'accepted').ok, false);
assert.equal(parseDeviationRecords(control).length, 1);
assert.equal(setDeviationVerdict(control, 'DEM-DL-1', 'accepted').ok, true);
console.log(
  JSON.stringify({
    case: 'handoff-orphan',
    completeAccepted: completed.ok,
    records: parseDeviationRecords(content).length,
    verdict: setDeviationVerdict(content, 'DEM-DL-1', 'accepted'),
    controlRecords: parseDeviationRecords(control).length,
    controlVerdictAccepted: setDeviationVerdict(control, 'DEM-DL-1', 'accepted').ok,
  })
);
```

`currentAttemptProven=true` — существующий lower-level seam. Это **не** реальный CLI/Verify
round-trip и не доказательство обхода Verify. Полный lifecycle — обязательный контроль EA-1.

## 2. Blocker formatter всегда предлагает оператора

```js
import { formatPlan } from './cli/cmd/sdd-task/sdd-task.types.ts';
const meta = { taskId: 'DEM-config', status: '[~] IN_PROGRESS', dependencies: [], specRefs: [] };
for (const blockers of [
  [],
  ['- 🛑 2026-10-26 BLOCKED: tsconfig moduleResolution conflicts with package type'],
]) {
  console.log(
    JSON.stringify({
      case: 'blocker-hint',
      activeBlockers: blockers.length,
      next: formatPlan(meta, [], {}, [], blockers)
        .split('\n')
        .find((l) => l.startsWith('next:')),
    })
  );
}
```

Фактический stdout:

```json
{"case":"blocker-hint","activeBlockers":0,"next":"next: открой тикет, исполняй фазы по протоколу (phase-execution-protocol), по одной, в порядке deps."}
{"case":"blocker-hint","activeBlockers":1,"next":"next: сначала разбери активные блокеры с оператором — фазы не запускать, пока список не пуст."}
```

Это безусловная ветка formatter. Устранимость конкретного config failure и следование этому
совету живой моделью здесь не измерялись.

## 3. Writer обязанности противоречат друг другу

Проверены обычным текстовым чтением, без XML parser:

- `cli/cmd/sdd-task/sdd-task.types.ts:317`: worker — `never call sdd-log`.
- `ai/directives/sdd-v2/phase-execution-protocol/steps/STEP_2_IMPLEMENT.xml:15` и `:22`:
  `ToolCall owner="phase-agent"` требует `sdd-log line` и `sdd-log blocker`.
- `ai/kit/axiom/process/ax-deviation-self-resolve.xml:6`: запись DL через `direct Edit`.

Первые два пункта — прямое противоречие обязанностей. Третий — ещё одна writer model, не
утверждение, что процитированная строка worker отдельно запрещала любой DL edit. Выбор живой
модели между этими указаниями пока не измерен.

## 4. Watchdog принимает новый call ID за activity, не semantic progress

```js
import assert from 'node:assert/strict';
import { SddEvalObserver } from './ai/flow-eval/observer.ts';
let call = 'same';
const source = {
  readTail: async () => [
    {
      messageId: 'message',
      role: 'assistant',
      text: '',
      fingerprint: 'unused',
      toolCalls: [
        {
          callId: call,
          tool: 'bash',
          status: 'completed',
          inputSummary: 'npm test',
          command: 'npm test',
          exitCode: 1,
          diagnostic: 'same E_CONFIG',
        },
      ],
    },
  ],
  readEvents: async () => [],
  readStatus: async () => 'running',
  readDiff: async () => '',
};
const observer = new SddEvalObserver(source, { everyMs: 0, stuckAfter: 1, tailLimit: 10 });
const first = await observer.observe('session');
const repeat = await observer.observe('session', first);
call = 'new-id-same-command-and-error';
const changed = await observer.observe('session', first);
const pick = (o) => ({
  progress: o.progress,
  artifactProgress: o.artifactProgress,
  repeatCount: o.repeatCount,
  stuck: o.stuck,
});
assert.equal(repeat.stuck, true);
assert.equal(changed.stuck, false);
assert.equal(changed.artifactProgress, false);
console.log(
  JSON.stringify({
    case: 'watchdog-not-semantic-progress',
    repeat: pick(repeat),
    newCallSameState: pick(changed),
    node: process.version,
  })
);
```

Фактический stdout:

```json
{
  "case": "watchdog-not-semantic-progress",
  "repeat": { "progress": false, "artifactProgress": false, "repeatCount": 1, "stuck": true },
  "newCallSameState": {
    "progress": true,
    "artifactProgress": false,
    "repeatCount": 0,
    "stuck": false
  },
  "node": "v22.19.0"
}
```

Observer — liveness watchdog; это ограничение измерения, а не доказательство существования
продуктового retry counter. `stuckAfter:1` — диагностический параметр, не новая политика продукта.
В `AX_RE_DISPATCH` также найдено `a new tool run ... resets the count`: это требует уточнения
значимого основания, не механического изменения каждого watchdog ради получения PASS.

## Source identity и проверки

SHA-256 фактических source bytes, совпадающих с указанным Git source:

| Source                                                                     | SHA-256                                                            |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `cli/cmd/sdd-log/sdd-log.types.ts`                                         | `34701a69528d97b8e70cc16d797c533c037698208d50932f73cb1af528857330` |
| `shared/sdd/deviation.ts`                                                  | `18045f66b58c99b3e79faa9d657acac9a827cfa1721fc447dbdd159fe4bd504b` |
| `cli/cmd/sdd-task/sdd-task.types.ts`                                       | `254138fbadc6b77dfe004ab9a02da6f262263dc6b7cb54bdf702cdc6c171ea87` |
| `ai/flow-eval/observer.ts`                                                 | `ffe9693b64102e8087a8e67173a472ee072c8aecb8f9b33a068834b06a82b74d` |
| `ai/directives/sdd-v2/phase-execution-protocol/steps/STEP_2_IMPLEMENT.xml` | `d9bef98d4fce941f57766214342942a2d901fc44ce1fbbce5d7f138febedb18e` |
| `ai/kit/axiom/process/ax-deviation-self-resolve.xml`                       | `02d6373b7e5f769558c40c7d7a9a9e4d469ead4db9b348025c0a2ace2e60f1ec` |
| `ai/kit/axiom/process/ax-re-dispatch.xml`                                  | `bc4051e19772c4038da4c4c2fe6e522d99fa5c49701b9294a1fb9fa6e843a906` |

Существующие `deviation.test.ts` + `sdd-task.cmd.test.ts`: **90/90 PASS**, suites 7.
Дополнительно `evidence-events.test.ts` + `trajectory.test.ts`: **15/15 PASS**, suites 5.
Первый sandbox-запуск этих двух suites получил `listen EPERM` на локальном HTTP/SSE порту;
повтор с разрешённым loopback прошёл. Это ограничение окружения, не исправление продукта и
не новый model eval. Сумма существующих тестов: 105 PASS, новых regression tests пока нет.
Это не новые regression tests: они не покрывают end-to-end потерю решения и разрешённый technical
replan; именно этот пробел предстоит закрыть. `npm run type-check`: exit 0. Модульная draft spec
после заполнения canonical requirements: `sdd-check --spec … --authoring` clean.
Родительская scope spec: schema current, authoring 0 errors/3 прежних advisory warnings
(Golden DX, Data Flow, старые FR headings); они не скрываются и не объявляются исправленными.

Независимый read-only reviewer повторил диагностики на Node 26.5.0 с теми же outcomes; основной
замер выше отдельно повторён автором на Node 22.19.0. Новых live model результатов здесь нет.

## Последующие изменения — не перекраска baseline

2026-10-26: оператор уточнил, что разработка ведётся отдельным планом AI-flow/eval, без SDD
тикетов и approval-маркеров. Временная draft-правка parent bootstrap table отменена как
не относящаяся к исследованию. Указанные выше schema/authoring observations относятся к моменту
измерения, не к утверждению, что parent scope теперь исправлен.

Начат candidate: только blocker guidance в `sdd-task` изменён с unconditional operator pause на
classification-first. Два существующих assertions и два новых technical/authority контроля дали
RED (4 failures) до исправления и GREEN после. Исходные stdout/source hashes выше не меняются:
повторять baseline следует на указанном исходном commit, не на candidate. Потеря deviation и
противоречие writer obligations этим малым изменением не исправлены; live эффект пока не измерен.
