ОТЧЁТ 61/LOCK-1 — замок-тест: `model:` пин никогда не возвращается (Пачка 9)

СТАТУС: DONE

Рабочее дерево: `rc-v6`, ветка `lead/surface-locks` (база `origin/lead/kit-lint` = `61b86fb8`).

КОММИТ (локальный, НИЧЕГО не запушено):
- `3feace46` feat(LOCK-1): lock model pin regression in shipped skills/directives/templates

---

## 1. Файлы

| Путь | Тип | Смысловое изменение | Чем доказано |
|---|---|---|---|
| `ai/kit/__tests__/stateless-sdd-flow-contract.test.ts` | правка | Добавлен хелпер `walkFiles(dir)` (рекурсивный обход файлов) и новый `describe('model pin never returns (LOCK-1)')`: сканирует `ai/skills`, `ai/directives`, `ai/kit/templates` на регекс `model:\s*["']?(?:sonnet\|haiku\|opus)["']?`; список нарушителей обязан быть пуст. | `node --import tsx --test ai/kit/__tests__/stateless-sdd-flow-contract.test.ts` — 1/1 новый `it` зелёный (см. §3). |

`git show --stat 3feace46`: 1 файл изменён, 32 insertions(+), 1 deletion(-) — совпадает с таблицей.

---

## 2. Архитектура было / стало

### Было — нет замка на регресс model-пина (20-ISSUES-VERDICTS.md #9.5)

```mermaid
flowchart LR
  V1["v1 dispatch: model: \"sonnet\"|\"haiku\"|\"opus\" хардкод"]
  FIX["90b123e9 (#14) — пин снят, добавлено «inherit the caller's configured model»"]
  V2["ai/kit/templates/sdd-v2/execute.directive.hbs — model не задан"]
  NOLOCK["ai/kit/__tests__/stateless-sdd-flow-contract.test.ts — контракт на statelessness, БЕЗ проверки на model-пин"]
  V1 --> FIX --> V2
  V2 -.-> NOLOCK
  style NOLOCK fill:#611,stroke:#f66,color:#fff
```
Разрыв: v2 не унаследовал пин, но и не имел механической проверки — регресс (случайное возвращение `model: "sonnet"` в новый шаблон/скилл) прошёл бы незамеченным.

### Стало — regression-lock сканирует всю поставляемую поверхность

```mermaid
flowchart LR
  ROOTS["roots = ['ai/skills','ai/directives','ai/kit/templates']"]
  WALK["walkFiles(root) — ai/kit/__tests__/stateless-sdd-flow-contract.test.ts:16-25"]
  SCAN["pin = /model:\s*[\"']?(sonnet|haiku|opus)[\"']?/ — :306-320"]
  ROOTS --> WALK --> SCAN
  SCAN -->|"offenders.length === 0"| PASS["assert.deepEqual(offenders, []) — PASS"]
  style PASS fill:#163,stroke:#3a3,color:#fff
```
Узлы: `walkFiles` (новая функция, `ai/kit/__tests__/stateless-sdd-flow-contract.test.ts:16`), сканируемые корни и паттерн внутри нового `describe`/`it` (файл конца, добавлен после существующего контракта).

---

## 3. Доказательства (ПРИЁМКА брифа: «контрактный тест»)

```
$ node --import tsx --test --experimental-test-module-mocks ai/kit/__tests__/stateless-sdd-flow-contract.test.ts
...
ok 6 - model pin never returns (LOCK-1)
# tests 8 (suites), все ok
# fail 0
```
exit 0. **ВЫПОЛНЕНО.**

Дополнительно: после коммита прогнан полный `npm run check` (см. общий отчёт пачки) — прошёл на итоговом состоянии ветки (после всех 5 коммитов).

---

## 4. Отклонения и открытые вопросы

Нет отклонений от брифа — задача выполнена ровно так, как была найдена в незакоммиченном рабочем дереве предыдущего исполнителя; проверена и подтверждена независимо (перечитан код, прогнан тест изолированно).

Команда пуша для Lead (после независимой верификации): `git -C rc-v6 push origin lead/surface-locks` (весь диапазон 5 коммитов пачки 9, один push).
