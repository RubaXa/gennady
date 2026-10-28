# SC4 — восемь завершённых фазовых попыток

**Решение: принимать механику declared coverage ради корректности владения, не как
гарантированную экономию токенов/денег.** Candidate дал правильный ожидаемый исход 4/4,
baseline 3/4. Это один пример на случай/arm, не статистическая гарантия.

Baseline `b4e444164d217c13f880648fe0a6b9c9f0150775`; candidate
`55ac2143fb3be2c608d214d05faab920ad331b42`. Только `llm-proxy/deepseek-v4-flash`;
8 primary dispatches, replacements=0; 8 независимых read-only judge и 8 отдельных reflection.

## Сравнение

Все стрелки: baseline → candidate. Токены — `input + output + reasoning`, без `cacheRead`.
Время — первичный host elapsed; SDK-span отдельно сохранён в JSON. Judge/reflection исключены.

| Случай                                     | Корректность SDD                | Инструменты |     Время, с | Токены без cacheRead |
| ------------------------------------------ | ------------------------------- | ----------: | -----------: | -------------------: |
| Маленькая задача среди незаявленных файлов | PASS → PASS                     |     20 → 10 |  90,7 → 65,9 |      27 134 → 35 793 |
| Большой File Mapping, одна маленькая фаза  | FAIL владения → PASS            |     28 → 17 | 105,9 → 67,7 |      46 424 → 52 344 |
| Чужой владелец                             | ожидаемый STOP → ожидаемый STOP |     19 → 12 |  96,1 → 40,5 |      36 527 → 19 286 |
| Create/delete/future P2                    | PASS → PASS                     |     21 → 23 | 99,3 → 101,6 |      23 554 → 40 381 |

Главный контрпример: large/baseline правильно реализовал функцию, но **не добавил `@spec`**.
Его настоящий canonical Verify и последний journal attempt дали PASS. Host-оракул и независимый
judge результат отвергли; host complete не запускался. Candidate получил настоящий gate PASS
с правильным владельцем и принятый canonical host complete. Это закрытие ложнозелёного владения,
а не доказательство более качественной бизнес-логики во всём проекте.

На трёх сопоставимых принятых парах small/foreign/paths: инструменты 60 → 45 (**−25%**),
время 286052 → 207969ms (**−27,30%**), токены без cacheRead 87215 → 95460 (**+9,45%**).
`cacheRead` 674432 → 552064 (−18,14%); суммарные token counters с ним −14,98%.
Large не включён в экономию: baseline не прошёл качество. Суммы описательные, не non-inferiority.

Индивидуально: small быстрее/меньше вызовов, но больше некэшированных токенов;
foreign лучше по всем трём первичным ресурсам при правильном STOP; paths дороже по токенам
и вызовам при том же качестве. Поэтому обещания универсального ускорения/удешевления нет.

## Что именно проверено

- Реальный Octavius source commit `2bb9a8039e5479634f8dfb5a6d234d0991278ace`: 4030 экспортированных
  файлов, 3001 исходник. Из 4043 regular files исключено 13 (credentials/agent configuration/content
  scan); non-regular Git entries и старая Git history не экспортировались.
- Маленькая реализация и тест синтетические и одинаковы для arms; остальной корпус настоящий.
  Это **не** сборка Octavius, не полный execute/scaffold/audit и не воспроизведение всех случаев Александра.
- Восемь no-model case/arm qualification rows: правильная реализация/complete проходят,
  поломка функции причинно краснит оба runtime; missing/foreign ownership краснят candidate.
  Фактические permissive baseline exits сохранены, baseline не исправлялся ради эксперимента.
- Full offline flow-eval **692/692 + shell7/7**; fixture/privacy controls **6/6**, включая настоящий
  sandbox-exec canary с разрешённым checkout и запрещённым посторонним temp-файлом.
- Unrelated files/config/tests и установленный runtime не менялись; terminal worker authority/native
  ticket writes не обнаружены. Трассы и usage полные, запрошенный worker model подтверждён SDK.
- `hostCompletionAccepted` — реальный exit0 канонической команды, не отдельный сохранённый
  terminal disk snapshot. Whole-ticket/group DONE не заявляется.

## Что не доказано

Полная допустимость каждого Bash не доказана: **0/8 full-trajectory PASS**, `not-proven` сохранён.
В обоих arms есть discovery/чтение через Bash; распознавание операции не доказывает её необходимость.
Не заявляются безопасность против произвольных detached writers, статистическое неухудшение,
полная runtime-поддержка `[route].tsx` repair (Q1) или работа всего пользовательского приложения.
Foreign — явно заданная проверка запрета reassignment, не слепое исследование обнаружения конфликта.

## Расход и приватность

Primary: **281443** токена без cacheRead. Judge: **34398**, reflection: **215791**.
Всего этих counters: **531632**. Цена не известна; provider-reported cost=0 не означает бесплатно.
Полный cache overhead reflection не сохранён и не подменяется нулём.

Публичные файлы содержат только числа/enum/hash и открытые исходники самого Gennady.
`privacy-audit.json`: проверено 66 публичных файлов до записи самого аудита, совпадений с
настроенными credential values нет; raw source exports/model fields не обнаружены. Это
структурная/credential-value проверка, не обещание универсального распознавания любого секрета.
Private source/diff/paths и свободные тексты judge/reflection не публикуются: компактное
hash-bound evidence хранится локально вне Git. Рабочие checkout, серверы и private SDK state
удалены после каждой попытки; общий runtime/snapshot root удалён в конце. Общие зависимости
переиспользовались через проверенные symlinks. Исходный Octavius остался чистым на том же HEAD.

## Предзапусковые отказы не скрыты

Первый no-model контроль ошибочно ожидал новый ownership reject от старого baseline; исправлено
ожидание стенда, baseline не менялся. Второй подготовительный запуск остановился на offline suite;
его экземпляр не сохранил stdout, поэтому точная причина того отказа не доказана. Диагностика
исправлена, полная успешная suite имеет отдельный stdout hash.

Первая live reservation остановилась до создания server config/state/session из-за различия
global OpenCode endpoint и LLM_PROXY env. Cleanup-finally первоначально замаскировал причину.
Исходный controller сохранён в predecessor; recovery подтвердил **0 model dispatches** и удалил
root. Это один дополнительный failed pre-dispatch reservation, **не замена** модельной попытки.
Continuation фиксирует перед promptAsync отдельные 8 dispatch markers. Транспорт берётся из
явно настроенного LLM_PROXY env; модель не менялась, ошибочные модельные исходы не повторялись.

## Воспроизведение разбора

`protocol.json`, `records/`, `dispatches/`, `report.json`, `comparison.json`,
`harness-archive.json` и `harness/` фиксируют контекст и фактические исходы.
Postflight fixture/privacy/immutable-record controls: 12/12 PASS; `evidence-manifest.json`
связывает финальные публичные артефакты, а TS-архивы точно совпадают с исполнявшимися SHA.
Проверка публичных данных не требует приватного Octavius. Для локального reviewer с отдельно
выданным private evidence directory:

```bash
node --import tsx ai/flow-eval/scripts/coverage-benchmark-review.mjs \
  ai/flow-eval/results/2026-10-28-sdd-coverage-sc4-live-continued \
  <private-evidence-directory>
```

Серия закончена. Следующее действие — final review SC4 в Draft PR #131, **не новая серия,
не merge и не публикация npm**.
