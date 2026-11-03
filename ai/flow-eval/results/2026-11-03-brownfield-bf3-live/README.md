# BF3 — закрытая серия8/8

Начните с [результата и решения](REPORT.md), затем [118 действий](TRAJECTORIES.md).

- `records/`, `dispatches/`, `reservations/`, `report.json`, `protocol.json` — исходные public machine bytes кампании e24, не перекрашены.
- `independent/` — отдельное экспертное толкование каждого вызова; не замена raw.
- `qualification.json` — безопасная hash/scalar-проекция; полные исходные diagnostics приватны.
- `harness/` — exact executed source из e24; `post-campaign-harness/` — новый no-model контроль измерителя.
- `manifest.json` связывает все файлы; recorded suite проверяет Git index, полноту и hashes на чистом клоне.

Восемь попыток уже потрачены, replacements0; автоматически повторять кампанию нельзя.
Offline replay: `node --import tsx --test ai/flow-eval/__tests__/brownfield-benchmark-recorded.test.ts`.
