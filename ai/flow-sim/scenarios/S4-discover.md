# S4 — портала нет, код есть: `root` вызывает `discover-from-code` через `sdd-state --probe`

Проверяет: router `LOGIC_SWITCH` ветку 1 (портал absent → `root.directive.xml`), и внутри `root`
STEP_0_INTAKE — что именно `sdd-state --probe` (не какой-то ручной осмотр) решает `CODE=present` vs
`CODE=absent`, и что `discover-from-code` грузится ЧЕРЕЗ `root`, а не напрямую роутером.

## Fixture

Портала нет (`specs/README.md` отсутствует), `tasks/` нет.

`package.json`:
```json
{
  "name": "legacy-app",
  "version": "1.0.0",
  "scripts": {
    "start": "node dist/index.js"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "strict": true,
    "outDir": "dist"
  },
  "include": ["src"]
}
```

`src/index.ts`:
```typescript
import { createUser } from './user.ts';
import { connect } from './db.ts';

const db = connect();
createUser(db, 'demo@example.com');
```

`src/user.ts`:
```typescript
import type { Db } from './db.ts';

export function createUser(db: Db, email: string): void {
  db.insert('users', { email });
}
```

`src/db.ts`:
```typescript
export type Db = { insert: (table: string, row: Record<string, unknown>) => void };

export function connect(): Db {
  return { insert: () => {} };
}
```

## Entry

Скилл: `/sdd`. Первая реплика оператора:

> Наведи SDD-порядок в проекте.

## Operator Script

(Пусто — прогон останавливается на показе общей картины, до первого вопроса, требующего ответа
оператора; `discover-from-code` STEP_1_PICTURE ждёт свободный текст, но стоп фиксируется на моменте
показа, симулировать ответ не нужно.)

## Stop

Сразу после того, как `discover-from-code.directive` STEP_1_PICTURE показал общую картину
(`UNDERSTANDING_BLOCK_FORMAT`: инферированный vision, scope graph, инфра/тулчейн, конвенции) с
разметкой Facts / Assumptions / Hypotheses — ДО STEP_2_PERSIST_PICTURE (до `sdd-new portal` и любой
записи на диск).

## Checkpoints

1. `sdd-state` вызван первым (без `--probe`) — репортит портал absent.
2. Сработавшая ветка router `LOGIC_SWITCH` — дословно: «WHEN specs/README.md is absent OR intent =
   project-setup ... -> READ_AND_USE_DIRECTIVE("ai/directives/sdd-v2/root.directive.xml")». В трейсе
   `directive: ai/directives/sdd-v2/root.directive.xml loaded` идёт СРАЗУ после router, раньше
   `discover-from-code`.
3. Внутри `root.directive` STEP_0_INTAKE — `sdd-state --probe` вызван ВТОРЫМ tool-вызовом (после
   первого `sdd-state` без флага), дословно по директиве: «run `sdd-state --probe` to learn whether
   the repo is greenfield or already holds code (`AX_TOOL_INVOCATION`; probe only now that it is
   needed — not at flow start)».
4. Probe отчитал `CODE=present` (три `.ts`-файла в `src/`) — сработавшая ветка `root` STEP_0_INTAKE:
   «`CODE=present` -> **from-code recovery** — do NOT invent a vision over existing code:
   READ_AND_USE_DIRECTIVE("ai/directives/sdd-v2/discover-from-code.directive.xml")». `H_NO_CODE`
   (проверяемый внутри `discover-from-code`) не сработал — код был.
5. `discover-from-code` загружен ЧЕРЕЗ `root`, не напрямую роутером — в трейсе порядок строго:
   `router` → `root.directive.xml loaded` → `directive: ai/directives/sdd-v2/discover-from-code.directive.xml loaded`.
   Ни `infra.directive.xml`, ни `module.directive.xml`, ни `scaffold.directive.xml` не загружены
   (это STEP_3_DEEPEN — опциональный шаг после стопа, недостижим).
6. Ни одной строки `write:` в трейсе — STEP_0_CARTOGRAPHY read-only («Read-only.»), стоп до
   STEP_2_PERSIST_PICTURE (которая первая пишет — через `sdd-new portal`).
7. Показанная картина разделяет Facts / Assumptions / Hypotheses (`AX_EVIDENCE_HYGIENE`) и явно
   помечает vision как «зачем и куда — твоё» (per STEP_1_PICTURE: «inferred **vision** ... but marked
   operator-owned: «зачем и куда — твоё»»).
