# sdd-check baseline (D-38 / GAP-B-1)

Directory contents:

- `sdd-check-227c03a8.json` — versioned baseline artifact. Findings of `sdd-check --all . --format json`
  at commit `227c03a83830124fe2aa22541dd5374beb8a53c6` (tag `rc-baseline-1`), deduplicated and sorted by
  `(code, file, severity)`, plus `countsByCode` (raw per-code error/warn counts) and `totals`. The bare
  total (198 error / 431 warn) is recorded but is **not** the criterion the gate uses — the gate compares
  the actual `(code, file)` set.
- `before-report.md` — histograms (by severity, by code, by file) and the exact commands/exit codes
  captured on the snapshot (REL-17).
- `environment.json` — Node/npm/OS + `package-lock.json` sha256 at capture time.
- `README.md` — this file.

## Что это и зачем (D-38, D-39)

По решению оператора D-38 срез RC заморожен тегом `rc-baseline-1` на коммите `227c03a83830124fe2aa22541dd5374beb8a53c6`.
По D-39 мягкого режима проверок для v1/mixed корпуса нет: `sdd-check --all .` на этом срезе КРАСНЫЙ
(198 error / 431 warn, exit 1) и остаётся красным до self-migration — это ОЖИДАЕМО, а не повод редактировать
v1-данные вне мигратора, чтобы «позеленить» прогон.

Baseline существует, чтобы отличить **известное сегодня** от **новой регрессии**: пока корень красный по
причинам, зафиксированным здесь, любой ДОПОЛНИТЕЛЬНЫЙ error — код/файл, которого нет в этом списке —
обязан ронять гейт. Именно это делает предикат zero-new-error
(`ai/flow-eval/scripts/sdd-check-zero-new-error.ts`).

## Пересборка baseline — ТОЛЬКО по решению оператора (D-38)

**Самовольная пересборка baseline запрещена.** Если после дальнейшей работы над self-migration число
находок меняется (уменьшается по мере починки v1-корпуса, или растёт по не связанной с этой веткой причине),
файл `sdd-check-227c03a8.json` НЕ переписывается тихо — это отдельная задача с явным OK оператора,
как и было для самого создания этого baseline.

Если такая задача будет выдана, генератор уже существует и детерминирован:

```
npm run build
node --import tsx ai/flow-eval/scripts/generate-sdd-check-baseline.ts \
  --commit <новый SHA> --tag <новый тег, если есть> \
  --out ai/flow-eval/.baseline/sdd-check-<новый SHA принято сокращать до 8 hex>.json
```

Генератор отказывается работать, если `git rev-parse HEAD` не совпадает с переданным `--commit` — это
защита от случайной пересборки на не том дереве, не от обхода требования "спроси оператора".

## Гейт zero-new-error: что и куда подключено

- Библиотека сравнения (чистая, без fs/process): `ai/flow-eval/scripts/sdd-check-baseline-compare.ts`.
- Общий раннер sdd-check --format json (обходит известную усечённость stdout при пайпе — см. заголовок
  файла): `ai/flow-eval/scripts/run-sdd-check-json.ts`.
- CLI-гейт: `ai/flow-eval/scripts/sdd-check-zero-new-error.ts` — точка входа в CI.
- Юнит-тест с фикстурными baseline (identical → ok; new error → fail с именованием; new warning → ok):
  `ai/flow-eval/scripts/__tests__/sdd-check-baseline-compare.test.ts` (подхватывается `npm test`
  автоматически — `ai/flow-eval/` уже входит в `UNIT_ROOTS` в `scripts/test-topology.ts`, правка
  test-topology.ts не потребовалась; проверено `node --import tsx scripts/test-topology.ts list`).

### Куда подключено — и куда НЕ подключено, и почему

`package.json`:

```
"gate:sdd-check-baseline": "node --import tsx ai/flow-eval/scripts/sdd-check-zero-new-error.ts --baseline ai/flow-eval/.baseline/sdd-check-227c03a8.json",
"check:ci": "npm run check && npm run build && npm run gate:sdd-check-baseline"
```

**НЕ добавлено** в `npm run check` (используемый `scripts/git-hooks/pre-commit` на каждый коммит) и
**НЕ добавлено** в сам `scripts/git-hooks/pre-commit`. Причина — прямое указание брифа 0/5: разместить
предикат там, где он не замедляет pre-commit. `sdd-check --all .` проходит 212+ файлов и занимает заметное
время; pre-commit уже прогоняет полную лестницу (`sdd-verify --profile full` + четыре audit:\* гейта +
directive-budgets) на каждый коммит. `check:ci` — отдельный, самостоятельный npm-скрипт, предназначенный
для CI-стадии.

На момент этой задачи в дереве RC (`codex/sdd-v2-rc52-followup`) каталога `.github/workflows/` НЕТ —
проверено (`find .github` → not found). Значит, автоматического вызова `check:ci` пока не существует; сам
факт добавления workflow-файла — за пределами ФАЙЛЫ этой задачи (никаких правок продукта/инфраструктуры
CI сверх перечисленного в брифе). Это **отклонение/открытый пункт**, зафиксированный в отчёте: когда
появится `.github/workflows/*.yml` (или другая CI-обвязка), туда нужно добавить шаг `npm run check:ci`
(или напрямую `npm run gate:sdd-check-baseline` после отдельного `npm run build`).

## Инвариант: только error ломает гейт

Warnings — известные или новые — никогда не проваливают `gate:sdd-check-baseline`. Матчинг — по паре
`(code, file)`; номер строки и текст сообщения не входят в ключ (могут дрейфовать без последствий).
